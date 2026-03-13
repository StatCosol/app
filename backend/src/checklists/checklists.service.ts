import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchComplianceEntity } from './entities/branch-compliance.entity';

@Injectable()
export class ChecklistsService {
  constructor(
    @InjectRepository(BranchComplianceEntity)
    private readonly branchComplianceRepo: Repository<BranchComplianceEntity>,
  ) {}

  /** All checklist items for a branch, optionally filtered by status */
  async getByBranch(branchId: string, status?: string) {
    const qb = this.branchComplianceRepo
      .createQueryBuilder('bc')
      .where('bc.branch_id = :branchId', { branchId });
    if (status) qb.andWhere('bc.status = :status', { status });
    qb.orderBy('bc.created_at', 'DESC');
    return qb.getMany();
  }

  /** All checklist items for a client */
  async getByClient(clientId: string) {
    return this.branchComplianceRepo.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Update applicability / status of a single item */
  async updateItem(
    id: string,
    data: Partial<
      Pick<
        BranchComplianceEntity,
        'isApplicable' | 'status' | 'reason' | 'ownerUserId'
      >
    >,
  ) {
    await this.branchComplianceRepo.update(id, data);
    return this.branchComplianceRepo.findOneByOrFail({ id });
  }

  /** Bulk-set applicability for a branch */
  async bulkSetApplicability(
    branchId: string,
    items: { complianceId: string; isApplicable: boolean; reason?: string }[],
    clientId: string,
    source: string,
  ) {
    const entities = items.map((item) =>
      this.branchComplianceRepo.create({
        branchId,
        clientId,
        complianceId: item.complianceId,
        isApplicable: item.isApplicable,
        reason: item.reason ?? null,
        source,
        status: item.isApplicable ? 'PENDING' : 'NOT_APPLICABLE',
      }),
    );
    return this.branchComplianceRepo.save(entities);
  }

  /** Summary counts per status for a branch */
  async branchSummary(branchId: string) {
    const rows: { status: string; count: string }[] =
      await this.branchComplianceRepo
        .createQueryBuilder('bc')
        .select('bc.status', 'status')
        .addSelect('COUNT(*)::int', 'count')
        .where('bc.branch_id = :branchId', { branchId })
        .groupBy('bc.status')
        .getRawMany();
    return rows.reduce(
      (acc, r) => ({ ...acc, [r.status]: Number(r.count) }),
      {} as Record<string, number>,
    );
  }
}
