import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { PayrollClientSetupEntity } from './entities/payroll-client-setup.entity';
import { PayrollComponentEntity } from './entities/payroll-component.entity';
import { PayrollComponentRuleEntity } from './entities/payroll-component-rule.entity';
import { PayrollComponentSlabEntity } from './entities/payroll-component-slab.entity';
import { SaveSlabsDto } from './dto/payroll-setup.dto';

@Injectable()
export class PayrollSetupService {
  constructor(
    @InjectRepository(PayrollClientSetupEntity)
    private readonly setupRepo: Repository<PayrollClientSetupEntity>,
    @InjectRepository(PayrollComponentEntity)
    private readonly compRepo: Repository<PayrollComponentEntity>,
    @InjectRepository(PayrollComponentRuleEntity)
    private readonly ruleRepo: Repository<PayrollComponentRuleEntity>,
    @InjectRepository(PayrollComponentSlabEntity)
    private readonly slabRepo: Repository<PayrollComponentSlabEntity>,
  ) {}

  // ── Setup ──────────────────────────────────────────────────

  async getSetup(clientId: string) {
    const setup = await this.setupRepo.findOne({ where: { clientId } });
    if (!setup) return { clientId, exists: false };
    return setup;
  }

  async upsertSetup(clientId: string, dto: Partial<PayrollClientSetupEntity>) {
    const payload = this.sanitizeSetupDto(dto);
    let setup = await this.setupRepo.findOne({ where: { clientId } });
    if (setup) {
      Object.assign(setup, payload);
    } else {
      setup = this.setupRepo.create({ ...payload, clientId });
    }
    return this.setupRepo.save(setup);
  }

  // ── Components ─────────────────────────────────────────────

  async listComponents(clientId: string, type?: string) {
    const where: FindOptionsWhere<PayrollComponentEntity> = { clientId };
    if (type)
      where.componentType =
        type as FindOptionsWhere<PayrollComponentEntity>['componentType'];
    return this.compRepo.find({
      where,
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async createComponent(
    clientId: string,
    dto: Partial<PayrollComponentEntity>,
  ) {
    if (!dto.code || !dto.name || !dto.componentType) {
      throw new BadRequestException('code, name, componentType are required');
    }
    const exists = await this.compRepo.findOne({
      where: { clientId, code: dto.code },
    });
    if (exists) {
      throw new BadRequestException(
        `Component code '${dto.code}' already exists`,
      );
    }
    const comp = this.compRepo.create({ ...dto, clientId });
    return this.compRepo.save(comp);
  }

  async updateComponent(
    clientId: string,
    componentId: string,
    dto: Partial<PayrollComponentEntity>,
  ) {
    const comp = await this.compRepo.findOne({
      where: { id: componentId, clientId },
    });
    if (!comp) throw new NotFoundException('Component not found');
    Object.assign(comp, dto);
    return this.compRepo.save(comp);
  }

  async deleteComponent(clientId: string, componentId: string) {
    const comp = await this.compRepo.findOne({
      where: { id: componentId, clientId },
    });
    if (!comp) throw new NotFoundException('Component not found');
    // Rules and slabs cascade-delete via FK
    await this.compRepo.remove(comp);
    return { deleted: true };
  }

  // ── Rules ──────────────────────────────────────────────────

  async listRules(componentId: string) {
    const rules = await this.ruleRepo.find({
      where: { componentId },
      order: { priority: 'ASC', createdAt: 'ASC' },
    });
    const result: Array<
      PayrollComponentRuleEntity & { slabs: PayrollComponentSlabEntity[] }
    > = [];
    for (const rule of rules) {
      const slabs = await this.slabRepo.find({
        where: { ruleId: rule.id },
        order: { fromAmount: 'ASC' },
      });
      result.push({ ...rule, slabs });
    }
    return result;
  }

  async createRule(
    componentId: string,
    dto: Partial<PayrollComponentRuleEntity>,
  ) {
    if (!dto.ruleType) {
      throw new BadRequestException('ruleType is required');
    }
    const rule = this.ruleRepo.create({ ...dto, componentId });
    return this.ruleRepo.save(rule);
  }

  async updateRule(ruleId: string, dto: Partial<PayrollComponentRuleEntity>) {
    const rule = await this.ruleRepo.findOne({ where: { id: ruleId } });
    if (!rule) throw new NotFoundException('Rule not found');
    Object.assign(rule, dto);
    return this.ruleRepo.save(rule);
  }

  async deleteRule(ruleId: string) {
    const rule = await this.ruleRepo.findOne({ where: { id: ruleId } });
    if (!rule) throw new NotFoundException('Rule not found');
    await this.ruleRepo.remove(rule);
    return { deleted: true };
  }

  // ── Slabs ──────────────────────────────────────────────────

  async listSlabs(ruleId: string) {
    return this.slabRepo.find({
      where: { ruleId },
      order: { fromAmount: 'ASC' },
    });
  }

  /**
   * Replace a rule's slabs. Named fields only — `id` and `ruleId` from the body
   * are ignored — and delete + insert in one transaction, so a rejected band
   * cannot leave the rule with no slabs at all.
   */
  async saveSlabs(ruleId: string, body: SaveSlabsDto) {
    const rule = await this.ruleRepo.findOne({ where: { id: ruleId } });
    if (!rule) throw new NotFoundException('Rule not found');
    const component = await this.compRepo.findOne({
      where: { id: rule.componentId },
    });

    const bands = [...(body.slabs || [])].sort(
      (a, b) => a.fromAmount - b.fromAmount,
    );
    bands.forEach((s, i) => {
      if (s.toAmount != null && s.toAmount < s.fromAmount)
        throw new BadRequestException(
          `Slab ${i + 1}: toAmount is below fromAmount`,
        );
      const next = bands[i + 1];
      if (next && (s.toAmount == null || s.toAmount > next.fromAmount))
        throw new BadRequestException(
          `Slabs overlap from ${next.fromAmount}; only the last slab may be open-ended`,
        );
    });

    const num = (v: number | null | undefined) =>
      v == null ? null : String(v);
    return this.slabRepo.manager.transaction(async (em) => {
      await em.delete(PayrollComponentSlabEntity, { ruleId });
      return em.save(
        bands.map((s) =>
          this.slabRepo.create({
            ruleId,
            clientId: rule.clientId ?? component?.clientId ?? null,
            fromAmount: String(s.fromAmount),
            toAmount: num(s.toAmount),
            slabPct: num(s.slabPct),
            slabFixed: num(s.slabFixed),
          }),
        ),
      );
    });
  }

  private sanitizeSetupDto(
    dto: Partial<PayrollClientSetupEntity>,
  ): Partial<PayrollClientSetupEntity> {
    const out: Partial<PayrollClientSetupEntity> = {};
    const copy = <K extends keyof PayrollClientSetupEntity>(key: K) => {
      const value = dto[key];
      if (value !== undefined) out[key] = value;
    };

    copy('pfEnabled');
    copy('esiEnabled');
    copy('ptEnabled');
    copy('lwfEnabled');
    copy('pfEmployerRate');
    copy('pfEmployeeRate');
    copy('esiEmployerRate');
    copy('esiEmployeeRate');
    copy('pfWageCeiling');
    copy('pfGrossThreshold');
    copy('esiWageCeiling');
    copy('payCycle');
    copy('effectiveFrom');
    copy('cycleStartDay');
    copy('payoutDay');
    copy('lockDay');
    copy('arrearMode');
    copy('leaveAccrualPerMonth');
    copy('maxCarryForward');
    copy('allowCarryForward');
    copy('lopMode');
    copy('attendanceSource');
    copy('attendanceCutoffDay');
    copy('graceMinutes');
    copy('autoLockAttendance');
    copy('syncEnabled');
    copy('enableLoanRecovery');
    copy('enableAdvanceRecovery');
    copy('defaultDeductionCapPct');
    copy('recoveryOrder');

    return out;
  }
}
