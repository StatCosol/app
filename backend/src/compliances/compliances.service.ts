import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { ComplianceMasterEntity } from './entities/compliance-master.entity';
import {
  ComplianceApplicabilityEntity,
  BranchCategory,
} from './entities/compliance-applicability.entity';
import { BranchComplianceEntity } from '../checklists/entities/branch-compliance.entity';
import { BranchType, ChecklistStatus } from '../common/enums';
import { AssignmentsService } from '../assignments/assignments.service';
import { BranchEntity } from '../branches/entities/branch.entity';

@Injectable()
export class CompliancesService {
  private readonly logger = new Logger(CompliancesService.name);

  constructor(
    @InjectRepository(ComplianceMasterEntity)
    private readonly complianceRepo: Repository<ComplianceMasterEntity>,
    @InjectRepository(ComplianceApplicabilityEntity)
    private readonly applicabilityRepo: Repository<ComplianceApplicabilityEntity>,
    @InjectRepository(BranchComplianceEntity)
    private readonly branchComplianceRepo: Repository<BranchComplianceEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    private readonly assignmentsService: AssignmentsService,
    private readonly dataSource: DataSource,
  ) {}

  private toBranchCategory(branchType: string): BranchCategory {
    return String(branchType || '').toUpperCase() === 'FACTORY'
      ? 'FACTORY'
      : 'ESTABLISHMENT';
  }

  private async getBranchProfile(branchId: string) {
    const branch = await this.branchRepo.findOne({
      where: { id: branchId, isDeleted: false },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const derivedHeadcount =
      (Number(branch.employeeCount) || 0) +
      (Number(branch.contractorCount) || 0);
    const headcount =
      branch.headcount != null && Number.isFinite(Number(branch.headcount))
        ? Number(branch.headcount)
        : derivedHeadcount;

    return {
      clientId: branch.clientId,
      stateCode: branch.stateCode ?? null,
      branchCategory: this.toBranchCategory(branch.branchType),
      headcount,
    };
  }

  async findAll() {
    try {
      return await this.complianceRepo.find({
        where: { isActive: true },
        order: { id: 'ASC' },
      });
    } catch (err) {
      this.logger.error(
        'findAll compliance_master failed',
        (err as Error).stack,
      );
      return [];
    }
  }

  async getBranchCompliances(branchId: string) {
    const branch = await this.branchRepo.findOne({
      where: { id: branchId, isDeleted: false },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const selected = await this.branchComplianceRepo.find({
      where: { branchId },
    });
    const selectedIds = new Set(selected.map((m) => m.complianceId));

    const compliances = await this.complianceRepo.find({
      where: { isActive: true },
      order: { complianceName: 'ASC' },
    });

    const branchType = String(
      branch.branchType || '',
    ).toUpperCase() as BranchType;
    const isFactory = branchType === BranchType.FACTORY;
    const state = (branch.stateCode || '').toUpperCase();
    const derivedHeadcount =
      (Number(branch.employeeCount) || 0) +
      (Number(branch.contractorCount) || 0);
    const headcount =
      branch.headcount != null && Number.isFinite(Number(branch.headcount))
        ? Number(branch.headcount)
        : derivedHeadcount;

    return compliances.map((c) => {
      const lawFamily = (c.lawFamily || '').toUpperCase();
      let applicable = false;
      let reason = '';

      if (lawFamily === 'LABOUR_CODE') {
        applicable = true;
        reason = 'Applies to all branches (Labour Code)';
      } else if (lawFamily === 'FACTORY_ACT') {
        applicable = isFactory;
        reason = applicable ? 'Factory branch' : 'Factory-only compliance';
      } else if (lawFamily === 'SHOPS_ESTABLISHMENTS') {
        applicable = !isFactory;
        reason = applicable
          ? 'Establishment/S&E branch'
          : 'Not applicable to factory';
      } else {
        applicable = true;
        reason = 'Generic compliance';
      }

      const scope = (c.stateScope || 'ALL').toUpperCase();
      if (applicable && scope !== 'ALL') {
        const states = scope
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (!state || !states.includes(state)) {
          applicable = false;
          reason = `State scope excludes ${state || 'N/A'}`;
        }
      }

      if (applicable && c.minHeadcount != null && headcount < c.minHeadcount) {
        applicable = false;
        reason = `Headcount below minimum (${c.minHeadcount})`;
      }

      if (applicable && c.maxHeadcount != null && headcount > c.maxHeadcount) {
        applicable = false;
        reason = `Headcount above maximum (${c.maxHeadcount})`;
      }

      return {
        complianceId: c.id,
        complianceName: c.complianceName,
        lawName: c.lawName,
        frequency: c.frequency,
        applicable,
        reason,
        selected: selectedIds.has(c.id),
        autoApplicable: applicable && lawFamily === 'LABOUR_CODE', // Example: auto-apply LABOUR_CODE
      };
    });
  }

  async getBranchComplianceSummaries(branchId: string) {
    const mappings = await this.branchComplianceRepo.find({
      where: { branchId },
      order: { id: 'ASC' },
    });

    if (!mappings.length) {
      return [];
    }

    const complianceIds = mappings
      .map((m) => m.complianceId)
      .filter((id): id is string => !!id);
    const compliances = complianceIds.length
      ? await this.complianceRepo.find({ where: { id: In(complianceIds) } })
      : [];

    const byId = new Map<string, ComplianceMasterEntity>(
      compliances.map((c) => [c.id, c]),
    );

    return mappings.map((m) => {
      const c = m.complianceId ? byId.get(m.complianceId) : undefined;
      return {
        id: m.id,
        branchId: m.branchId,
        complianceId: m.complianceId,
        complianceName: c?.complianceName ?? `Compliance #${m.complianceId}`,
        lawName: c?.lawName ?? null,
        frequency: c?.frequency ?? null,
        status: m.status,
      };
    });
  }

  async saveBranchCompliances(
    branchId: string,
    clientId: string,
    complianceIds: string[],
    ownerUserId: string | null,
  ) {
    if (!ownerUserId) {
      throw new BadRequestException('ownerUserId missing from token');
    }

    const branch = await this.branchRepo.findOne({
      where: { id: branchId, isDeleted: false as any },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    if (clientId && branch.clientId !== clientId) {
      throw new BadRequestException('Branch does not belong to client');
    }

    const parsedIds = (complianceIds ?? [])
      .map((id) => String(id).trim())
      .filter(Boolean);

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const bad = parsedIds.find((id) => !uuidRegex.test(id));
    if (bad) {
      throw new BadRequestException(`Invalid complianceId UUID: ${bad}`);
    }

    if (parsedIds.length) {
      const found = await this.complianceRepo.find({
        where: { id: In(parsedIds) },
      });
      const foundSet = new Set(found.map((x) => x.id));
      const missing = parsedIds.filter((id) => !foundSet.has(id));
      if (missing.length) {
        throw new BadRequestException(
          `Unknown complianceId(s): ${missing.join(', ')}`,
        );
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(BranchComplianceEntity, { branchId });

      if (parsedIds.length) {
        const mappings = parsedIds.map((complianceId) =>
          manager.create(BranchComplianceEntity, {
            branchId,
            clientId,
            complianceId,
            ownerUserId,
            status: ChecklistStatus.PENDING as string,
            isApplicable: true,
            source: 'MANUAL' as const,
            reason: null,
          }),
        );

        await manager.save(BranchComplianceEntity, mappings);
      }
    });

    return {
      ok: true,
      branchId,
      clientId,
      complianceIds: parsedIds,
      count: parsedIds.length,
    };
  }

  async recomputeBranchComplianceApplicability(branchId: string) {
    const profile = await this.getBranchProfile(branchId);

    const rules = await this.applicabilityRepo.find({
      where: [
        {
          isActive: true,
          branchCategory: profile.branchCategory,
          stateCode: profile.stateCode,
        },
        {
          isActive: true,
          branchCategory: profile.branchCategory,
          stateCode: null,
        },
      ] as any,
      order: { priority: 'ASC' },
    });

    const applicableComplianceIds = rules
      .filter(
        (r) => r.minHeadcount == null || profile.headcount >= r.minHeadcount,
      )
      .filter(
        (r) => r.maxHeadcount == null || profile.headcount <= r.maxHeadcount,
      )
      .map((r) => r.complianceId);

    const finalIds = Array.from(new Set(applicableComplianceIds));

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(BranchComplianceEntity, {
        branchId,
        source: 'AUTO' as any,
      } as any);

      if (finalIds.length) {
        const rows = finalIds.map((complianceId) =>
          manager.create(BranchComplianceEntity, {
            clientId: profile.clientId,
            branchId,
            complianceId,
            isApplicable: true,
            source: 'AUTO',
            reason: null,
            ownerUserId: null,
            status: ChecklistStatus.PENDING as string,
          }),
        );

        await manager.save(BranchComplianceEntity, rows);
      }
    });

    return {
      ok: true,
      branchId,
      autoCount: finalIds.length,
      branchCategory: profile.branchCategory,
      headcount: profile.headcount,
    };
  }

  async listCrmComplianceWorklist(
    crmUserId: string,
    filters: {
      clientId?: string;
      branchId?: string;
      status?: ChecklistStatus | 'all';
      dueMonth?: string;
    },
  ) {
    const assignedClients =
      await this.assignmentsService.getAssignedClientsForCrm(crmUserId);
    const assignedIds = assignedClients.map((c: any) => c.id);
    if (!assignedIds.length) {
      return { data: [], total: 0 };
    }

    const clientIds =
      filters.clientId && assignedIds.includes(filters.clientId)
        ? [filters.clientId]
        : assignedIds;

    const qb = this.branchComplianceRepo
      .createQueryBuilder('bc')
      .leftJoin(ComplianceMasterEntity, 'cm', 'cm.id = bc.complianceId')
      .select([
        'bc.id AS id',
        'bc.clientId AS clientId',
        'bc.branchId AS branchId',
        'bc.complianceId AS complianceId',
        'bc.ownerUserId AS ownerUserId',
        'bc.status AS status',
        'cm.complianceName AS complianceName',
      ])
      .where('bc.clientId IN (:...clientIds)', { clientIds });

    if (filters.branchId) {
      qb.andWhere('bc.branchId = :branchId', { branchId: filters.branchId });
    }

    if (filters.status && filters.status !== 'all') {
      qb.andWhere('bc.status = :status', { status: filters.status });
    }

    qb.orderBy('bc.id', 'ASC');

    const rows = await qb.getRawMany();
    return {
      data: rows.map((r: any) => ({
        id: String(r.id),
        clientId: r.clientId as string,
        branchId: r.branchId as string,
        complianceId: String(r.complianceId),
        complianceName: r.complianceName as string,
        ownerUserId: r.ownerUserId ? String(r.ownerUserId) : null,
        status: r.status as ChecklistStatus,
      })),
      total: rows.length,
    };
  }
}
