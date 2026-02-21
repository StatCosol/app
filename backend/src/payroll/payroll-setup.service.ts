import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollClientSetupEntity } from './entities/payroll-client-setup.entity';
import { PayrollComponentEntity } from './entities/payroll-component.entity';
import { PayrollComponentRuleEntity } from './entities/payroll-component-rule.entity';
import { PayrollComponentSlabEntity } from './entities/payroll-component-slab.entity';

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
    let setup = await this.setupRepo.findOne({ where: { clientId } });
    if (setup) {
      Object.assign(setup, dto);
    } else {
      setup = this.setupRepo.create({ ...dto, clientId });
    }
    return this.setupRepo.save(setup);
  }

  // ── Components ─────────────────────────────────────────────

  async listComponents(clientId: string, type?: string) {
    const where: any = { clientId };
    if (type) where.componentType = type;
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
      throw new BadRequestException(`Component code '${dto.code}' already exists`);
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
    const result: any[] = [];
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

  async saveSlabs(
    ruleId: string,
    body: { slabs: Partial<PayrollComponentSlabEntity>[] },
  ) {
    // Replace all slabs for this rule
    await this.slabRepo.delete({ ruleId });
    const slabs = (body.slabs || []).map((s) =>
      this.slabRepo.create({ ...s, ruleId }),
    );
    return this.slabRepo.save(slabs);
  }
}
