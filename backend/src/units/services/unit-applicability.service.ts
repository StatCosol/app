import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { UnitApplicableComplianceEntity } from '../entities/unit-applicable-compliance.entity';
import { UnitApplicabilityAuditEntity } from '../entities/unit-applicability-audit.entity';
import { UnitComplianceMasterEntity } from '../../masters/entities/unit-compliance-master.entity';

@Injectable()
export class UnitApplicabilityService {
  constructor(
    @InjectRepository(UnitApplicableComplianceEntity)
    private readonly applicableRepo: Repository<UnitApplicableComplianceEntity>,

    @InjectRepository(UnitApplicabilityAuditEntity)
    private readonly auditRepo: Repository<UnitApplicabilityAuditEntity>,

    @InjectRepository(UnitComplianceMasterEntity)
    private readonly complianceRepo: Repository<UnitComplianceMasterEntity>,
  ) {}

  /** Get all applicable compliance rows for a branch (with compliance details). */
  async getApplicable(branchId: string) {
    return this.applicableRepo.find({
      where: { branchId },
      relations: ['compliance'],
      order: { computedAt: 'DESC' },
    });
  }

  /**
   * Select special-act compliances for a branch.
   * Creates SPECIAL_SELECTED rows for the given compliance codes.
   */
  async setSpecialActs(
    branchId: string,
    specialActCodes: string[],
    actorUserId: string | null,
  ) {
    if (!specialActCodes || specialActCodes.length === 0) return [];

    const compliances = await this.complianceRepo.find({
      where: {
        code: In(specialActCodes),
        category: 'SPECIAL_ACT',
        isActive: true,
      },
    });

    if (compliances.length === 0) {
      throw new BadRequestException('No valid special act codes found');
    }

    const saved: UnitApplicableComplianceEntity[] = [];
    for (const c of compliances) {
      let row = await this.applicableRepo.findOne({
        where: { branchId, complianceId: c.id },
      });
      if (!row) {
        row = this.applicableRepo.create({
          branchId,
          complianceId: c.id,
        } as Partial<UnitApplicableComplianceEntity>);
      }
      row.isApplicable = true;
      row.source = 'SPECIAL_SELECTED';
      row.computedBy = actorUserId;
      row.computedAt = new Date();
      saved.push(row);
    }

    const result = await this.applicableRepo.save(saved);

    await this.auditRepo.save(
      this.auditRepo.create({
        branchId,
        actorUserId,
        action: 'SPECIAL_ACT_SELECTED',
        afterJson: { specialActCodes },
      } as Partial<UnitApplicabilityAuditEntity>),
    );

    return result;
  }

  /**
   * Apply manual overrides to existing applicability rows.
   * Each override must include a reason (min 5 chars).
   */
  async applyOverrides(
    branchId: string,
    overrides: Array<{
      complianceId: string;
      isApplicable: boolean;
      reason: string;
    }>,
    actorUserId: string | null,
  ) {
    if (!overrides || overrides.length === 0) return [];

    for (const o of overrides) {
      if (!o.reason || o.reason.trim().length < 5) {
        throw new BadRequestException(
          `Override reason must be at least 5 characters (compliance=${o.complianceId})`,
        );
      }
    }

    const beforeRows = await this.applicableRepo.find({
      where: { branchId },
    });
    const beforeMap = new Map(beforeRows.map((r) => [r.complianceId, r]));

    const saved: UnitApplicableComplianceEntity[] = [];
    for (const o of overrides) {
      let row = beforeMap.get(o.complianceId);
      if (!row) {
        row = this.applicableRepo.create({
          branchId,
          complianceId: o.complianceId,
        } as Partial<UnitApplicableComplianceEntity>);
      }
      row.isApplicable = o.isApplicable;
      row.source = 'OVERRIDE';
      row.overrideReason = o.reason.trim();
      row.computedBy = actorUserId;
      row.computedAt = new Date();
      saved.push(row);
    }

    const result = await this.applicableRepo.save(saved);

    await this.auditRepo.save(
      this.auditRepo.create({
        branchId,
        actorUserId,
        action: 'OVERRIDE_APPLIED',
        beforeJson: beforeRows
          .filter((r) =>
            overrides.some((o) => o.complianceId === r.complianceId),
          )
          .map((r) => ({
            complianceId: r.complianceId,
            isApplicable: r.isApplicable,
            source: r.source,
          })),
        afterJson: overrides,
      } as Partial<UnitApplicabilityAuditEntity>),
    );

    return result;
  }
}
