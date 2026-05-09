import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PayrollClientStructureEntity } from './entities/payroll-client-structure.entity';
import { PayrollStructureComponentEntity } from './entities/payroll-structure-component.entity';
import { PayrollStatutoryConfigEntity } from './entities/payroll-statutory-config.entity';
import {
  CreateClientStructureDto,
  UpdateClientStructureDto,
} from './dto/client-structure.dto';

@Injectable()
export class ClientStructuresService {
  constructor(
    @InjectRepository(PayrollClientStructureEntity)
    private readonly structureRepo: Repository<PayrollClientStructureEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /** Create a full structure with components + statutory configs in one txn. */
  async create(dto: CreateClientStructureDto) {
    return this.dataSource.transaction(async (manager) => {
      // If marked as default, un-default all others for this client
      if (dto.isDefault) {
        await manager.update(
          PayrollClientStructureEntity,
          { clientId: dto.clientId, isDefault: true },
          { isDefault: false },
        );
      }

      const structure = manager.create(PayrollClientStructureEntity, {
        clientId: dto.clientId,
        name: dto.name,
        code: dto.code,
        version: dto.version ?? 1,
        effectiveFrom: dto.effectiveFrom,
        effectiveTo: dto.effectiveTo ?? null,
        isActive: dto.isActive ?? true,
        isDefault: dto.isDefault ?? false,
      });
      const saved = await manager.save(PayrollClientStructureEntity, structure);

      // Components
      if (dto.components?.length) {
        const components = dto.components.map((c) =>
          manager.create(PayrollStructureComponentEntity, {
            structureId: saved.id,
            code: c.code,
            name: c.name,
            label: c.label,
            componentType: c.type,
            calculationMethod: c.calculationMethod,
            displayOrder: c.displayOrder,
            fixedValue: c.fixedValue ?? null,
            percentageValue: c.percentageValue ?? null,
            basedOn: c.basedOn ?? null,
            formula: c.formula ?? null,
            roundRule: c.roundRule ?? 'NONE',
            taxable: c.taxable ?? true,
            statutory: c.statutory ?? false,
            isVisibleInPayslip: c.isVisibleInPayslip ?? true,
            isActive: c.isActive ?? true,
          }),
        );
        await manager.save(PayrollStructureComponentEntity, components);
      }

      // Statutory configs
      if (dto.statutoryConfigs?.length) {
        const configs = dto.statutoryConfigs.map((s) =>
          manager.create(PayrollStatutoryConfigEntity, {
            structureId: saved.id,
            stateCode: s.stateCode,
            minimumWage: s.minimumWage ?? null,
            warnIfGrossBelowMinWage: s.warnIfGrossBelowMinWage ?? true,
            enablePt: s.enablePt ?? true,
            enablePf: s.enablePf ?? true,
            enableEsi: s.enableEsi ?? true,
            pfEmployeeRate: s.pfEmployeeRate ?? 12,
            pfWageCap: s.pfWageCap ?? 15000,
            pfApplyIfGrossAbove: s.pfApplyIfGrossAbove ?? null,
            esiEmployeeRate: s.esiEmployeeRate ?? 0.75,
            esiEmployerRate: s.esiEmployerRate ?? 3.25,
            esiGrossCeiling: s.esiGrossCeiling ?? 21000,
            carryForwardLeave: s.carryForwardLeave ?? true,
            monthlyPaidLeaveAccrual: s.monthlyPaidLeaveAccrual ?? 1.5,
            attendanceBonusAmount: s.attendanceBonusAmount ?? null,
            attendanceBonusIfLopLte: s.attendanceBonusIfLopLte ?? null,
          }),
        );
        await manager.save(PayrollStatutoryConfigEntity, configs);
      }

      return this.findOneWithRelations(saved.id);
    });
  }

  /** List all active structures for a client, newest version first. */
  async findActiveByClient(clientId: string) {
    return this.structureRepo.find({
      where: { clientId, isActive: true },
      relations: ['components', 'statutoryConfigs'],
      order: { version: 'DESC' },
    });
  }

  /** List ALL structures (active + inactive) for a client, for configuration UI. */
  async findAllByClient(clientId: string) {
    return this.structureRepo.find({
      where: { clientId },
      relations: ['components', 'statutoryConfigs'],
      order: { isActive: 'DESC', version: 'DESC' },
    });
  }

  /** Get a single structure by ID. */
  async findOne(id: string) {
    return this.findOneWithRelations(id);
  }

  /** Soft-update structure meta (name, dates, active, default). */
  async update(id: string, dto: UpdateClientStructureDto) {
    const structure = await this.structureRepo.findOne({ where: { id } });
    if (!structure) throw new NotFoundException('Payroll structure not found');

    if (dto.isDefault) {
      await this.structureRepo.update(
        { clientId: structure.clientId, isDefault: true },
        { isDefault: false },
      );
    }

    Object.assign(structure, dto);
    await this.structureRepo.save(structure);
    return this.findOneWithRelations(id);
  }

  /**
   * Clone current structure into a new version and deactivate the old one.
   * Used for April/October minimum-wage updates, etc.
   */
  async createNextVersion(structureId: string, effectiveFrom: string) {
    const old = await this.structureRepo.findOne({
      where: { id: structureId },
      relations: ['components', 'statutoryConfigs'],
    });
    if (!old) throw new NotFoundException('Payroll structure not found');

    return this.dataSource.transaction(async (manager) => {
      // Deactivate old version
      await manager.update(
        PayrollClientStructureEntity,
        { id: old.id },
        { isActive: false, effectiveTo: effectiveFrom },
      );

      // Create new version
      const newStructure = manager.create(PayrollClientStructureEntity, {
        clientId: old.clientId,
        name: old.name,
        code: old.code,
        version: old.version + 1,
        effectiveFrom,
        effectiveTo: null,
        isActive: true,
        isDefault: old.isDefault,
      });
      const saved = await manager.save(
        PayrollClientStructureEntity,
        newStructure,
      );

      // Clone components
      if (old.components?.length) {
        const cloned = old.components.map((c) =>
          manager.create(PayrollStructureComponentEntity, {
            structureId: saved.id,
            code: c.code,
            name: c.name,
            label: c.label,
            componentType: c.componentType,
            calculationMethod: c.calculationMethod,
            displayOrder: c.displayOrder,
            fixedValue: c.fixedValue,
            percentageValue: c.percentageValue,
            basedOn: c.basedOn,
            formula: c.formula,
            roundRule: c.roundRule,
            taxable: c.taxable,
            statutory: c.statutory,
            isVisibleInPayslip: c.isVisibleInPayslip,
            isActive: c.isActive,
          }),
        );
        await manager.save(PayrollStructureComponentEntity, cloned);
      }

      // Clone statutory configs
      if (old.statutoryConfigs?.length) {
        const cloned = old.statutoryConfigs.map((s) =>
          manager.create(PayrollStatutoryConfigEntity, {
            structureId: saved.id,
            stateCode: s.stateCode,
            minimumWage: s.minimumWage,
            warnIfGrossBelowMinWage: s.warnIfGrossBelowMinWage,
            enablePt: s.enablePt,
            enablePf: s.enablePf,
            enableEsi: s.enableEsi,
            pfEmployeeRate: s.pfEmployeeRate,
            pfWageCap: s.pfWageCap,
            pfApplyIfGrossAbove: s.pfApplyIfGrossAbove,
            esiEmployeeRate: s.esiEmployeeRate,
            esiEmployerRate: s.esiEmployerRate,
            esiGrossCeiling: s.esiGrossCeiling,
            carryForwardLeave: s.carryForwardLeave,
            monthlyPaidLeaveAccrual: s.monthlyPaidLeaveAccrual,
            attendanceBonusAmount: s.attendanceBonusAmount,
            attendanceBonusIfLopLte: s.attendanceBonusIfLopLte,
          }),
        );
        await manager.save(PayrollStatutoryConfigEntity, cloned);
      }

      return this.findOneWithRelations(saved.id);
    });
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async findOneWithRelations(id: string) {
    const structure = await this.structureRepo.findOne({
      where: { id },
      relations: ['components', 'statutoryConfigs'],
    });
    if (!structure) throw new NotFoundException('Payroll structure not found');

    // Sort components by displayOrder
    structure.components?.sort((a, b) => a.displayOrder - b.displayOrder);
    return structure;
  }
}
