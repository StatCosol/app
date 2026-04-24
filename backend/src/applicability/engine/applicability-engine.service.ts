import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, In, Repository } from 'typeorm';

import { AeUnitEntity } from '../entities/ae-unit.entity';
import { AeUnitFactsEntity } from '../entities/ae-unit-facts.entity';
import { AeUnitActEntity } from '../entities/ae-unit-act.entity';
import { AeUnitActProfileEntity } from '../entities/ae-unit-act-profile.entity';
import { AeRuleMasterEntity } from '../entities/ae-rule-master.entity';
import { AeRuleConditionEntity } from '../entities/ae-rule-condition.entity';
import { AePackageItemEntity } from '../entities/ae-package-item.entity';
import { AeComplianceMasterEntity } from '../entities/ae-compliance-master.entity';
import { AeUnitComplianceEntity } from '../entities/ae-unit-compliance.entity';
import { AeUnitComplianceOverrideEntity } from '../entities/ae-unit-compliance-override.entity';
import { AeUnitTaskEntity } from '../entities/ae-unit-task.entity';
import { ComplianceSource, RuleApplyMode, TaskStatus } from '../entities/enums';

import { RuleEvaluator, ConditionNode, EngineContext } from './rule-evaluator';
import { strongerSource, mergeExplain } from './compliance-merge';
import { TaskGeneratorService } from './task-generator.service';

export interface EngineResultSummary {
  unitId: string;
  computedCompliances: number;
  applicableCount: number;
  appliedRuleIds: string[];
  appliedPackageCodes: string[];
  tasksUpserted: number;
}

type CompAcc = {
  isApplicable: boolean;
  source: ComplianceSource;
  locked: boolean;
  explain: Record<string, unknown>;
};

@Injectable()
export class ApplicabilityEngineService {
  private readonly logger = new Logger(ApplicabilityEngineService.name);
  private readonly evaluator = new RuleEvaluator();

  private unitRepo: Repository<AeUnitEntity>;
  private factsRepo: Repository<AeUnitFactsEntity>;
  private actRepo: Repository<AeUnitActEntity>;
  private actProfileRepo: Repository<AeUnitActProfileEntity>;
  private ruleRepo: Repository<AeRuleMasterEntity>;
  private ruleCondRepo: Repository<AeRuleConditionEntity>;
  private pkgItemRepo: Repository<AePackageItemEntity>;
  private complianceRepo: Repository<AeComplianceMasterEntity>;
  private unitComplianceRepo: Repository<AeUnitComplianceEntity>;
  private overrideRepo: Repository<AeUnitComplianceOverrideEntity>;
  private taskRepo: Repository<AeUnitTaskEntity>;

  constructor(
    private readonly _ds: DataSource,
    private readonly taskGen: TaskGeneratorService,
  ) {
    this.unitRepo = _ds.getRepository(AeUnitEntity);
    this.factsRepo = _ds.getRepository(AeUnitFactsEntity);
    this.actRepo = _ds.getRepository(AeUnitActEntity);
    this.actProfileRepo = _ds.getRepository(AeUnitActProfileEntity);
    this.ruleRepo = _ds.getRepository(AeRuleMasterEntity);
    this.ruleCondRepo = _ds.getRepository(AeRuleConditionEntity);
    this.pkgItemRepo = _ds.getRepository(AePackageItemEntity);
    this.complianceRepo = _ds.getRepository(AeComplianceMasterEntity);
    this.unitComplianceRepo = _ds.getRepository(AeUnitComplianceEntity);
    this.overrideRepo = _ds.getRepository(AeUnitComplianceOverrideEntity);
    this.taskRepo = _ds.getRepository(AeUnitTaskEntity);
  }

  /* ───────────────────────── CORE RECOMPUTE ───────────────────────── */

  async recompute(unitId: string): Promise<EngineResultSummary> {
    const now = new Date();

    // 1) Load unit
    const unit = await this.unitRepo.findOneBy({ id: unitId });
    if (!unit) throw new NotFoundException('Unit not found');

    // 2) Load facts
    const facts = await this.factsRepo.findOneBy({ unitId });
    const factsJson: Record<string, unknown> = facts?.factsJson ?? {};

    // 3) Load act toggles + profiles
    const acts = await this.actRepo.findBy({ unitId });
    const actProfiles = await this.actProfileRepo.findBy({ unitId });

    const actsMap: EngineContext['acts'] = {};
    for (const a of acts) actsMap[a.actCode] = { enabled: a.enabled };

    const actProfilesMap: EngineContext['actProfiles'] = {};
    for (const ap of actProfiles)
      actProfilesMap[ap.actCode] = ap.dataJson ?? {};

    const ctx: EngineContext = {
      unit: {
        id: unit.id,
        unitType: unit.unitType,
        establishmentType: unit.establishmentType,
        plantType: unit.plantType,
        state: unit.state,
      },
      facts: factsJson,
      acts: actsMap,
      actProfiles: actProfilesMap,
    };

    // 4) Load enabled rules for this scope, ordered by priority ASC
    const rules = await this.ruleRepo.find({
      where: { enabled: true, scope: unit.unitType },
      order: { priority: 'ASC' },
    });

    const ruleIds = rules.map((r) => r.id);
    const conds = ruleIds.length
      ? await this.ruleCondRepo.find({ where: { ruleId: In(ruleIds) } })
      : [];
    const condMap = new Map<string, ConditionNode>();
    for (const c of conds)
      condMap.set(c.ruleId, c.conditionJson as ConditionNode);

    // 5) Accumulator
    const computed = new Map<string, CompAcc>();
    const appliedRuleIds: string[] = [];
    const appliedPackageCodes = new Set<string>();

    const attachCompliance = (complianceId: string, meta: CompAcc) => {
      const existing = computed.get(complianceId);
      if (!existing) {
        computed.set(complianceId, { ...meta });
        return;
      }
      computed.set(complianceId, {
        isApplicable: existing.isApplicable || meta.isApplicable,
        source: strongerSource(existing.source, meta.source),
        locked: existing.locked || meta.locked,
        explain: mergeExplain(existing.explain, meta.explain),
      });
    };

    const attachPackage = async (
      packageCode: string,
      source: ComplianceSource,
      locked: boolean,
      explain: Record<string, unknown>,
    ) => {
      appliedPackageCodes.add(packageCode);
      const pkgItems = await this.pkgItemRepo.findBy({ packageCode });
      for (const pi of pkgItems) {
        attachCompliance(pi.complianceId, {
          isApplicable: true,
          source,
          locked,
          explain: { ...explain, packages: [packageCode] },
        });
      }
    };

    // 6) Evaluate rules
    for (const rule of rules) {
      const cond = condMap.get(rule.id);
      if (!cond) continue;

      if (!this.evaluator.matches(cond, ctx)) continue;

      appliedRuleIds.push(rule.id);

      const eff = rule.effectJson ?? {};
      const source =
        (eff.source as ComplianceSource) ?? ComplianceSource.AUTO_RULE;
      const locked = eff.locked !== undefined ? Boolean(eff.locked) : true;
      const baseExplain: Record<string, unknown> = {
        rules: [rule.id],
        ruleName: rule.name,
      };

      if (
        rule.applyMode === RuleApplyMode.ATTACH_PACKAGE &&
        rule.targetPackageCode
      ) {
        await attachPackage(
          rule.targetPackageCode,
          source,
          locked,
          baseExplain,
        );
      } else if (
        rule.applyMode === RuleApplyMode.ATTACH_COMPLIANCE &&
        rule.targetComplianceId
      ) {
        attachCompliance(rule.targetComplianceId, {
          isApplicable: true,
          source,
          locked,
          explain: baseExplain,
        });
      }
    }

    // 7) Apply admin overrides
    const overrides = await this.overrideRepo.findBy({ unitId });
    for (const ov of overrides) {
      const existing = computed.get(ov.complianceId);
      const explain = mergeExplain(existing?.explain ?? {}, {
        override: true,
        overrideReason: ov.reason,
      });

      if (ov.forceNotApplicable) {
        computed.set(ov.complianceId, {
          isApplicable: false,
          source: ComplianceSource.MANUAL_OVERRIDE,
          locked: ov.locked ?? true,
          explain,
        });
        continue;
      }
      if (ov.forceApplicable) {
        computed.set(ov.complianceId, {
          isApplicable: true,
          source: ComplianceSource.MANUAL_OVERRIDE,
          locked: ov.locked ?? true,
          explain,
        });
        continue;
      }
      if (existing && ov.locked != null) {
        computed.set(ov.complianceId, {
          ...existing,
          source: strongerSource(
            existing.source,
            ComplianceSource.MANUAL_OVERRIDE,
          ),
          locked: ov.locked,
          explain,
        });
      }
    }

    // 8) Persist unit_compliance (upsert)
    const complianceIds = Array.from(computed.keys());
    const existingRows = complianceIds.length
      ? await this.unitComplianceRepo.find({
          where: { unitId, complianceId: In(complianceIds) },
        })
      : [];
    const existingMap = new Map(existingRows.map((r) => [r.complianceId, r]));
    const toSave: AeUnitComplianceEntity[] = [];

    for (const [compId, acc] of computed.entries()) {
      const row =
        existingMap.get(compId) ??
        this.unitComplianceRepo.create({ unitId, complianceId: compId });
      row.isApplicable = acc.isApplicable;
      row.source = acc.source;
      row.locked = acc.locked;
      row.explainJson = acc.explain;
      row.computedAt = now;
      toSave.push(row);
    }

    if (toSave.length) await this.unitComplianceRepo.save(toSave);

    // 9) Remove computed rows that are no longer in the result set
    if (existingRows.length) {
      const staleIds = existingRows
        .filter((r) => !computed.has(r.complianceId))
        .map((r) => r.id);
      if (staleIds.length) {
        await this.unitComplianceRepo.delete(staleIds);
      }
    }

    // 10) Generate tasks for applicable periodic compliances
    let tasksUpserted = 0;
    const masters = complianceIds.length
      ? await this.complianceRepo.find({ where: { id: In(complianceIds) } })
      : [];
    const masterMap = new Map(masters.map((m) => [m.id, m]));

    for (const [compId, acc] of computed.entries()) {
      if (!acc.isApplicable) continue;
      const master = masterMap.get(compId);
      if (!master) continue;

      // Periodic tasks
      const sched = this.taskGen.getPeriodicSchedule(master, now);
      if (sched) {
        const exists = await this.taskRepo.findOneBy({
          unitId,
          complianceId: compId,
          periodStart: sched.periodStart,
        });
        if (!exists) {
          await this.taskRepo.save(
            this.taskRepo.create({
              unitId,
              complianceId: compId,
              periodStart: sched.periodStart,
              dueDate: sched.dueDate,
              status: TaskStatus.OPEN,
              generatedBy: 'ENGINE',
            }),
          );
          tasksUpserted++;
        }
      }

      // License expiry EVENT tasks
      if (master.taskTemplate?.type === 'LICENSE_EXPIRY') {
        tasksUpserted += await this.generateExpiryTasks(
          unitId,
          compId,
          master.taskTemplate,
          actProfilesMap,
        );
      }
    }

    const applicableCount = Array.from(computed.values()).filter(
      (c) => c.isApplicable,
    ).length;

    this.logger.log(
      `Recompute unit=${unitId}: ${computed.size} compliances, ${applicableCount} applicable, ${tasksUpserted} tasks`,
    );

    return {
      unitId,
      computedCompliances: computed.size,
      applicableCount,
      appliedRuleIds,
      appliedPackageCodes: Array.from(appliedPackageCodes),
      tasksUpserted,
    };
  }

  /* ───────────────── LICENSE EXPIRY REMINDERS ───────────────── */

  private async generateExpiryTasks(
    unitId: string,
    complianceId: string,
    tpl: Record<string, unknown>,
    actProfilesMap: Record<string, Record<string, unknown>>,
  ): Promise<number> {
    const actCode = String(tpl.actCode ?? '');
    const expiryField = String(tpl.expiryField ?? 'expiryDate');
    if (!actCode) return 0;

    const profile = actProfilesMap[actCode];
    const expiryRaw = profile?.[expiryField];
    if (!expiryRaw) return 0;

    const expiry = new Date(expiryRaw as string | number);
    if (Number.isNaN(expiry.getTime())) return 0;

    const leadDays = [60, 30, 15];
    const reminderDates = this.taskGen.getExpiryReminderDates(expiry, leadDays);

    let count = 0;
    for (const dueDate of reminderDates) {
      // Use dueDate as periodStart for uniqueness
      const exists = await this.taskRepo.findOneBy({
        unitId,
        complianceId,
        periodStart: dueDate,
      });
      if (!exists) {
        await this.taskRepo.save(
          this.taskRepo.create({
            unitId,
            complianceId,
            periodStart: dueDate,
            dueDate,
            status: TaskStatus.OPEN,
            generatedBy: 'ENGINE',
          }),
        );
        count++;
      }
    }
    return count;
  }

  /* ───────────────── APPLICABILITY QUERY ───────────────── */

  async getApplicability(unitId: string) {
    const unit = await this.unitRepo.findOneBy({ id: unitId });
    if (!unit) throw new NotFoundException('Unit not found');

    const rows = await this.unitComplianceRepo.find({ where: { unitId } });
    const compIds = rows.map((r) => r.complianceId);
    const masters = compIds.length
      ? await this.complianceRepo.find({ where: { id: In(compIds) } })
      : [];
    const masterMap = new Map(masters.map((m) => [m.id, m]));

    // Group by labourCode
    const grouped: Record<string, unknown[]> = {};
    for (const row of rows) {
      const master = masterMap.get(row.complianceId);
      const key = master?.labourCode ?? 'OTHER';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({
        complianceId: row.complianceId,
        code: master?.code,
        name: master?.name,
        groupCode: master?.groupCode,
        periodicity: master?.periodicity,
        isApplicable: row.isApplicable,
        source: row.source,
        locked: row.locked,
        explain: row.explainJson,
        computedAt: row.computedAt,
      });
    }

    return { unitId, unit, grouped };
  }
}
