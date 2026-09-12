import { dueScheduleKey } from './control-schedule';
import { AutomationGapReviewService } from './automation-gap-review.service';
import { AutomationNotificationService } from './services/automation-notification.service';
import { MonthlyCycleEngineService } from './services/monthly-cycle-engine.service';
import { AuditScheduleEngineService } from './services/audit-schedule-engine.service';
import { ApplicabilityEngineService } from './services/applicability-engine.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { operationalDate } from '../common/operational-date';
import { AutomationScope } from './automation-scope';
import {
  ControlScopeDto,
  ControlSettingsDto,
  RuleKey,
} from './control-center.dto';
import { ExpiryEngineService } from './services/expiry-engine.service';
import { RenewalFilingEngineService } from './services/renewal-filing-engine.service';
import { TaskEngineService } from './services/task-engine.service';
import { ReturnsFilingEngineService } from './services/returns-filing-engine.service';
import { NonComplianceEngineService } from './services/non-compliance-engine.service';
import { DueRemindersJob } from './jobs/due-reminders.job';

export const CONTROL_RULES = [
  {
    key: 'expiry',
    name: 'Expiry renewals',
    description:
      'Create renewal filings and tasks; remind contractors about expiring documents.',
    routing: 'Branch work queue and document owner',
    window: 'Registrations: 60 days; contractor documents: 30 days',
  },
  {
    key: 'task_reminders',
    name: 'Task reminders',
    description:
      'Remind task owners, escalate overdue work to CRM and remind scheduled auditors.',
    routing: 'Assigned owner, current CRM and assigned auditor',
    window: 'Tasks: due within 3 days; audits: within 5 days; overdue tasks',
  },
  {
    key: 'filing_overdue',
    name: 'Overdue filing alerts',
    description:
      'Notify the current CRM about overdue filings; increase priority after seven days.',
    routing: 'Current company CRM',
    window: 'Pending or in-progress filings past their due date',
  },
  {
    key: 'nc_reminders',
    name: 'Audit corrections',
    description:
      'Remind the audit owner about unresolved non-compliance findings.',
    routing: 'Assigned auditor; audit creator when no auditor is assigned',
    window: 'Open audit non-compliances',
  },
  {
    key: 'monthly_filings',
    name: 'Periodic filings',
    description:
      'Create filings and tasks from the configured return calendar.',
    routing: 'Branch work queue',
    window: 'Current calendar period; existing return master dates',
  },
  {
    key: 'monthly_cycles',
    name: 'Monthly compliance cycles',
    description:
      'Open monthly work from each branch’s applicable compliance list.',
    routing: 'Branch work queue',
    window: 'Current calendar month',
  },
  {
    key: 'audit_schedules',
    name: 'Audit scheduling',
    description: 'Generate due audit schedules from active frequency rules.',
    routing: 'Assigned auditor',
    window: 'Configured look-ahead',
  },
  {
    key: 'applicability',
    name: 'Applicability checks',
    description:
      'Recompute from branch facts and the selected compliance package; preserve manual overrides.',
    routing: 'Administrator review',
    window: 'Branches with configured facts',
  },
  {
    key: 'gap_review',
    name: 'AI gap review',
    description:
      'Review open activities and suggest next steps without changing approvals.',
    routing: 'Execution history and selected administrator recipients',
    window: 'Up to 20 open activities; full open count',
  },
];
type Control = {
  id: string;
  rule_key: RuleKey;
  client_id: string | null;
  branch_id: string | null;
  enabled: boolean;
  local_time: string;
  version: number;
  frequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  week_day?: number;
  month_day?: number;
  options?: import('./control-schedule').AutomationOptions;
};

@Injectable()
export class AutomationControlService {
  private readonly logger = new Logger(AutomationControlService.name);
  constructor(
    private readonly ds: DataSource,
    private readonly expiry: ExpiryEngineService,
    private readonly renewals: RenewalFilingEngineService,
    private readonly tasks: TaskEngineService,
    private readonly filings: ReturnsFilingEngineService,
    private readonly nc: NonComplianceEngineService,
    private readonly due: DueRemindersJob,
    private readonly cycles: MonthlyCycleEngineService,
    private readonly schedules: AuditScheduleEngineService,
    private readonly applicability: ApplicabilityEngineService,
    private readonly gaps: AutomationGapReviewService,
    private readonly notifications: AutomationNotificationService,
  ) {}

  private async controls(): Promise<Control[]> {
    return this.ds.query(
      'SELECT * FROM automation_controls ORDER BY rule_key,client_id NULLS FIRST,branch_id NULLS FIRST',
    );
  }
  private async validateScope(q: ControlScopeDto) {
    q.clientId = q.clientId?.toLowerCase();
    q.branchId = q.branchId?.toLowerCase();
    if (q.branchId && !q.clientId)
      throw new BadRequestException('Choose a company before its branch');
    if (
      q.clientId &&
      !(
        await this.ds.query(
          'SELECT id FROM clients WHERE id=$1 AND is_deleted=false',
          [q.clientId],
        )
      ).length
    )
      throw new BadRequestException('Company is unavailable');
    if (
      q.branchId &&
      !(
        await this.ds.query(
          'SELECT id FROM client_branches WHERE id=$1 AND clientid=$2 AND isactive=true',
          [q.branchId, q.clientId],
        )
      ).length
    )
      throw new BadRequestException(
        'Branch does not belong to this company or is inactive',
      );
  }
  private plan(q: ControlScopeDto, all: Control[]) {
    const rows = all.filter((c) => c.rule_key === q.ruleKey);
    const root = rows.find((c) => !c.client_id);
    if (!root) throw new ConflictException('Automation migration is required');
    const company = rows.find(
      (c) => c.client_id === q.clientId && !c.branch_id,
    );
    const exact = rows.find(
      (c) =>
        (c.client_id || null) === (q.clientId || null) &&
        (c.branch_id || null) === (q.branchId || null),
    );
    const settings = exact || company || root;
    const scope: AutomationScope = {
      options: settings.options || {},
      clientId: q.clientId,
      branchId: q.branchId,
      excludedClientIds: !q.clientId
        ? rows
            .filter((c) => c.client_id && !c.branch_id)
            .map((c) => c.client_id!)
            .sort()
        : [],
      excludedBranchIds: !q.branchId
        ? rows
            .filter(
              (c) => c.branch_id && (!q.clientId || c.client_id === q.clientId),
            )
            .map((c) => c.branch_id!)
            .sort()
        : [],
    };
    const enabled =
      root.enabled &&
      (!q.clientId || !company || company.enabled) &&
      settings.enabled;
    const snapshot = {
      ruleKey: q.ruleKey,
      scope,
      enabled,
      localTime: settings.local_time,
      frequency: settings.frequency || 'DAILY',
      weekDay: settings.week_day ?? 0,
      monthDay: settings.month_day ?? 1,
      version: exact?.version || 0,
      controlId: exact?.id || null,
      parents: rows
        .filter(
          (c) => !c.client_id || (c.client_id === q.clientId && !c.branch_id),
        )
        .map((c) => [c.id, c.version]),
      overrides: rows
        .filter(
          (c) =>
            scope.excludedClientIds?.includes(c.client_id!) ||
            scope.excludedBranchIds?.includes(c.branch_id!),
        )
        .map((c) => [c.id, c.version]),
    };
    return {
      ...snapshot,
      digest: createHash('sha256')
        .update(JSON.stringify(snapshot))
        .digest('hex'),
    };
  }
  async overview() {
    const [controls, companies, branches, recipients, packages] =
      await Promise.all([
        this.controls(),
        this.ds.query(
          'SELECT id,client_name AS name FROM clients WHERE is_deleted=false ORDER BY client_name',
        ),
        this.ds.query(
          'SELECT b.id,b.clientid AS "clientId",b.branchname AS name FROM client_branches b JOIN clients c ON c.id=b.clientid WHERE b.isactive=true AND c.is_deleted=false ORDER BY b.branchname',
        ),
        this.ds.query(
          "SELECT u.id,u.name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.is_active=true AND u.deleted_at IS NULL AND r.code='ADMIN' ORDER BY u.name",
        ),
        this.ds.query(
          'SELECT id,code,name FROM compliance_package WHERE is_active=true ORDER BY name',
        ),
      ]);
    return {
      aiAvailable: await this.gaps.isReady(),
      recipients,
      packages,
      rules: CONTROL_RULES,
      controls,
      companies,
      branches,
      timeZone: 'Asia/Kolkata',
    };
  }
  async save(q: ControlSettingsDto, actor: string) {
    await this.validateScope(q);
    if (q.options?.recipientIds?.length) {
      const allowed = await this.ds.query(
        "SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=ANY($1::uuid[]) AND u.is_active=true AND u.deleted_at IS NULL AND r.code='ADMIN'",
        [q.options.recipientIds],
      );
      if (allowed.length !== q.options.recipientIds.length)
        throw new BadRequestException(
          'Summary recipients must be active administrators',
        );
    }
    if (q.ruleKey === 'applicability' && q.options?.packageId) {
      const packages = await this.ds.query(
        'SELECT id FROM compliance_package WHERE (id::text=$1 OR code=$1) AND is_active=true',
        [q.options.packageId],
      );
      if (!packages.length)
        throw new BadRequestException('Choose an active compliance package');
    }
    return this.ds.transaction(async (manager) => {
      const [lock] = await manager.query(
        'SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',
        ['automation-run:' + q.ruleKey],
      );
      if (!lock.locked)
        throw new ConflictException(
          'This rule is running. Wait for it to finish before changing settings.',
        );
      const [old] = await manager.query(
        'SELECT * FROM automation_controls WHERE rule_key=$1 AND client_id IS NOT DISTINCT FROM $2::uuid AND branch_id IS NOT DISTINCT FROM $3::uuid FOR UPDATE',
        [q.ruleKey, q.clientId || null, q.branchId || null],
      );
      if ((old?.version || 0) !== q.version)
        throw new ConflictException('Settings changed. Refresh before saving.');
      let [saved] = old
        ? await manager.query(
            'WITH changed AS (UPDATE automation_controls SET enabled=$2,local_time=$3,version=version+1,updated_by=$4,updated_at=now() WHERE id=$1 RETURNING *) SELECT * FROM changed',
            [old.id, q.enabled, q.localTime, actor],
          )
        : await manager.query(
            'INSERT INTO automation_controls(rule_key,client_id,branch_id,enabled,local_time,updated_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
            [
              q.ruleKey,
              q.clientId || null,
              q.branchId || null,
              q.enabled,
              q.localTime,
              actor,
            ],
          );
      [saved] = await manager.query(
        'WITH changed AS (UPDATE automation_controls SET frequency=$2,week_day=$3,month_day=$4,options=$5::jsonb WHERE id=$1 RETURNING *) SELECT * FROM changed',
        [
          saved.id,
          q.frequency || old?.frequency || 'DAILY',
          q.weekDay ?? old?.week_day ?? 0,
          q.monthDay ?? old?.month_day ?? 1,
          JSON.stringify(q.options ?? old?.options ?? {}),
        ],
      );
      await manager.query(
        'INSERT INTO automation_control_changes(control_id,actor_id,before_value,after_value) VALUES($1,$2,$3::jsonb,$4::jsonb)',
        [
          saved.id,
          actor,
          old ? JSON.stringify(old) : null,
          JSON.stringify(saved),
        ],
      );
      return saved;
    });
  }
  async inherit(id: string, version: number, actor: string) {
    return this.ds.transaction(async (manager) => {
      const [old] = await manager.query(
        'SELECT * FROM automation_controls WHERE id=$1',
        [id],
      );
      if (!old) throw new NotFoundException('Setting not found');
      if (!old.client_id)
        throw new BadRequestException('Default settings cannot be removed');
      const [lock] = await manager.query(
        'SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',
        ['automation-run:' + old.rule_key],
      );
      if (!lock.locked)
        throw new ConflictException(
          'Wait for the current run before changing scope',
        );
      const rows = await manager.query(
        'WITH changed AS (DELETE FROM automation_controls WHERE id=$1 AND version=$2 RETURNING *) SELECT * FROM changed',
        [id, version],
      );
      if (!rows.length)
        throw new ConflictException('Settings changed. Refresh before saving.');
      await manager.query(
        'INSERT INTO automation_control_changes(control_id,actor_id,before_value,after_value) VALUES($1,$2,$3::jsonb,$4::jsonb)',
        [
          id,
          actor,
          JSON.stringify(rows[0]),
          JSON.stringify({ ...rows[0], inherited: true }),
        ],
      );
      return { inherited: true };
    });
  }
  async preview(
    q: ControlScopeDto & {
      options?: import('./control-schedule').AutomationOptions;
    },
  ) {
    await this.validateScope(q);
    const plan = this.plan(q, await this.controls());
    if (q.options) {
      plan.scope.options = q.options;
      const { digest, ...snapshot } = plan;
      plan.digest = createHash('sha256')
        .update(JSON.stringify(snapshot))
        .digest('hex');
    }
    const groups: { name: string; rows: any[] }[] = [];
    if (q.ruleKey === 'expiry') {
      groups.push({
        name: 'Registration expiries',
        rows: await this.renewals.getExpiringRegistrations(plan.scope),
      });
      groups.push({
        name: 'Contractor document expiries',
        rows: await this.expiry.getExpiringDocuments(plan.scope),
      });
    } else if (q.ruleKey === 'task_reminders') {
      groups.push({
        name: 'Tasks due soon',
        rows: await this.tasks.getTasksDueSoon(
          plan.scope.options?.taskDays ?? 3,
          plan.scope,
        ),
      });
      groups.push({
        name: 'Overdue tasks',
        rows: await this.tasks.getOverdueTasks(plan.scope),
      });
      groups.push({
        name: 'Scheduled audits',
        rows: await this.due.getSchedules(plan.scope),
      });
    } else if (q.ruleKey === 'filing_overdue')
      groups.push({
        name: 'Overdue filings',
        rows: await this.filings.getOverdueFilings(plan.scope),
      });
    else if (q.ruleKey === 'nc_reminders')
      groups.push({
        name: 'Open audit corrections',
        rows: await this.nc.getOpenNcForDailyReminder(plan.scope),
      });
    else {
      const [year, month] = operationalDate().split('-').map(Number);
      const rows =
        q.ruleKey === 'monthly_filings'
          ? await this.filings.candidates(year, month, plan.scope)
          : q.ruleKey === 'monthly_cycles'
            ? await this.cycles.candidates(plan.scope)
            : q.ruleKey === 'audit_schedules'
              ? await this.schedules.candidates(plan.scope)
              : q.ruleKey === 'applicability'
                ? await this.applicability.candidates(plan.scope)
                : await this.gaps.candidates(plan.scope);
      groups.push({
        name: CONTROL_RULES.find((r) => r.key === q.ruleKey)!.name,
        rows,
      });
    }
    return {
      plan,
      asOf: operationalDate(),
      groups: groups.map((g) => ({
        name: g.name,
        count: g.rows.length,
        examples: g.rows.slice(0, 5).map((r, index) => ({
          id: [
            r.id || r.reg_id || r.compliance_id || index,
            r.branch_id || '',
            r.master?.return_code || '',
          ].join(':'),
          title:
            r.title ||
            r.registration_type ||
            r.return_type ||
            r.documentName ||
            r.audit_type ||
            'Scheduled work',
        })),
      })),
      note: 'Eligible records at preview time. Existing completed work and delivered reminders are reused; actual new actions may be fewer. Records can change before execution.',
    };
  }
  async history(page = 1) {
    const [rows, count] = await Promise.all([
      this.ds.query(
        'SELECT r.*,u.name AS actor_name FROM automation_runs r LEFT JOIN users u ON u.id=r.actor_id ORDER BY r.started_at DESC,r.id DESC LIMIT 25 OFFSET $1',
        [(page - 1) * 25],
      ),
      this.ds.query('SELECT COUNT(*)::int AS total FROM automation_runs'),
    ]);
    return { rows, page, total: count[0].total };
  }
  async changes() {
    return this.ds.query(
      'SELECT c.*,u.name AS actor_name FROM automation_control_changes c LEFT JOIN users u ON u.id=c.actor_id ORDER BY c.created_at DESC,c.id DESC LIMIT 50',
    );
  }

  async run(
    controlId: string,
    requestId: string,
    actor: string | null,
    digest?: string,
    trigger: 'MANUAL' | 'SCHEDULED' | 'RETRY' = 'MANUAL',
    retryOf?: string,
  ) {
    controlId = controlId.toLowerCase();
    const control = (await this.controls()).find((c) => c.id === controlId);
    if (!control) throw new NotFoundException('Automation setting not found');
    const runner = this.ds.createQueryRunner();
    await runner.connect();
    let locked = false,
      run: any;
    const lockKey = 'automation-run:' + control.rule_key;
    try {
      const [lock] = await runner.query(
        'SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',
        [lockKey],
      );
      locked = lock.locked;
      if (!locked)
        throw new ConflictException(
          'This automation is already running. Refresh its history.',
        );
      const current = (await this.controls()).find((c) => c.id === controlId);
      if (!current) throw new NotFoundException('Automation setting not found');
      const q = {
        ruleKey: current.rule_key,
        clientId: current.client_id || undefined,
        branchId: current.branch_id || undefined,
      };
      await this.validateScope(q);
      const plan = this.plan(q, await this.controls());
      if (!plan.enabled)
        throw new ConflictException(
          'This automation is paused for the selected scope.',
        );
      if (digest && digest !== plan.digest)
        throw new ConflictException(
          'Settings or scope changed. Preview again before running.',
        );
      if (trigger !== 'SCHEDULED' && !digest)
        throw new BadRequestException(
          'Preview the automation before running it.',
        );
      const key =
        trigger === 'SCHEDULED'
          ? `schedule:${controlId}:${requestId}`
          : `request:${controlId}:${requestId}`;
      const [existing] = await runner.query(
        'SELECT * FROM automation_runs WHERE request_key=$1',
        [key],
      );
      // Owning this session lock proves no previous worker for this rule remains active.
      await runner.query(
        "UPDATE automation_runs SET status='INTERRUPTED',finished_at=now(),error_message='Worker stopped before completion. Safe retry is available.' WHERE rule_key=$1 AND status='RUNNING'",
        [control.rule_key],
      );
      if (existing)
        return (
          await runner.query('SELECT * FROM automation_runs WHERE id=$1', [
            existing.id,
          ])
        )[0];
      [run] = await runner.query(
        "INSERT INTO automation_runs(control_id,rule_key,request_key,trigger_type,actor_id,retry_of,status,snapshot) VALUES($1,$2,$3,$4,$5,$6,'RUNNING',$7::jsonb) RETURNING *",
        [
          controlId,
          control.rule_key,
          key,
          trigger,
          actor,
          retryOf || null,
          JSON.stringify(plan),
        ],
      );
      try {
        let result: any;
        if (control.rule_key === 'expiry')
          result = await this.expiry.generateExpiryAlerts(plan.scope);
        else if (control.rule_key === 'task_reminders')
          result = await this.due.handle(plan.scope);
        else if (control.rule_key === 'filing_overdue')
          result = await this.filings.generateOverdueAlerts(plan.scope);
        else if (control.rule_key === 'nc_reminders')
          result = await this.nc.sendDailyReminders(plan.scope);
        else {
          const [year, month] = operationalDate().split('-').map(Number);
          result =
            control.rule_key === 'monthly_filings'
              ? await this.filings.generateFilings(year, month, plan.scope)
              : control.rule_key === 'monthly_cycles'
                ? await this.cycles.openMonthlyCycle(month, year, plan.scope)
                : control.rule_key === 'audit_schedules'
                  ? await this.schedules.generateDueSchedules(plan.scope)
                  : control.rule_key === 'applicability'
                    ? await this.applicability.recomputeAllBranches(plan.scope)
                    : await this.gaps.review(plan.scope, actor || undefined);
        }
        const summaryFailures = await this.notifications.sendControlSummary(
          {
            ...run,
            snapshot: plan,
            status: result?.failures ? 'PARTIAL' : 'SUCCEEDED',
          },
          plan.scope.options?.recipientIds || [],
        );
        result = {
          ...result,
          failures: (result?.failures || 0) + summaryFailures,
        };
        [run] = await runner.query(
          'WITH changed AS (UPDATE automation_runs SET status=$2,result=$3::jsonb,finished_at=now() WHERE id=$1 RETURNING *) SELECT * FROM changed',
          [
            run.id,
            result?.failures ? 'PARTIAL' : 'SUCCEEDED',
            JSON.stringify(result || {}),
          ],
        );
      } catch (error) {
        this.logger.error(
          `Automation ${run.id} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        [run] = await runner.query(
          "WITH changed AS (UPDATE automation_runs SET status='FAILED',finished_at=now(),error_message='Execution failed. Completed actions are protected against duplicate retries; inspect server logs for the underlying error.' WHERE id=$1 RETURNING *) SELECT * FROM changed",
          [run.id],
        );
        await this.notifications.sendControlSummary(
          run,
          plan.scope.options?.recipientIds || [],
        );
      }
      return run;
    } finally {
      try {
        if (locked)
          await runner.query(
            'SELECT pg_advisory_unlock(hashtextextended($1,0))',
            [lockKey],
          );
      } finally {
        await runner.release();
      }
    }
  }
  async retry(id: string, requestId: string, actor: string) {
    const [old] = await this.ds.query(
      'SELECT * FROM automation_runs WHERE id=$1',
      [id],
    );
    if (!old) throw new NotFoundException('Run not found');
    if (!['FAILED', 'PARTIAL', 'INTERRUPTED'].includes(old.status))
      throw new ConflictException(
        'Only failed, partial or interrupted runs can be retried.',
      );
    if (operationalDate(new Date(old.started_at)) !== operationalDate())
      throw new ConflictException(
        'This run is from an earlier day. Preview and start a new run.',
      );
    return this.run(
      old.control_id,
      requestId,
      actor,
      old.snapshot.digest,
      'RETRY',
      id,
    );
  }
  async legacyBranchRun(ruleKey: RuleKey, actor: string, branchId: string) {
    const control = (await this.controls()).find(
      (c) => c.rule_key === ruleKey && c.branch_id === branchId.toLowerCase(),
    );
    if (!control)
      throw new ConflictException(
        'Save this branch scope in Admin Automation before running it.',
      );
    const preview = await this.preview({
      ruleKey,
      clientId: control.client_id!,
      branchId: control.branch_id!,
    });
    const run = await this.run(
      control.id,
      'legacy:' + operationalDate(),
      actor,
      preview.plan.digest,
    );
    return { ...(run.result || {}), runId: run.id, status: run.status };
  }
  async legacyRun(ruleKey: RuleKey, actor: string) {
    const row = (await this.controls()).find(
      (c) => c.rule_key === ruleKey && !c.client_id,
    )!;
    const preview = await this.preview({ ruleKey });
    const run = await this.run(
      row.id,
      `legacy:${operationalDate()}`,
      actor,
      preview.plan.digest,
    );
    return {
      ...(run.result || {}),
      runId: run.id,
      status: run.status,
      errorMessage: run.error_message,
    };
  }
  @Cron('0 * * * * *', { timeZone: 'Asia/Kolkata' })
  async tick() {
    const controls = await this.controls();
    for (const control of controls) {
      const plan = this.plan(
        {
          ruleKey: control.rule_key,
          clientId: control.client_id || undefined,
          branchId: control.branch_id || undefined,
        },
        controls,
      );
      const key = dueScheduleKey(control);
      if (!plan.enabled || !key) continue;
      try {
        await this.run(control.id, key, null, undefined, 'SCHEDULED');
      } catch (error) {
        if (!(error instanceof ConflictException))
          this.logger.error(
            'Scheduled automation ' +
              control.id +
              ': ' +
              (error instanceof Error ? error.message : String(error)),
          );
      }
    }
  }
}
