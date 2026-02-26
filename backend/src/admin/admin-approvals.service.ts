import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalRequestEntity } from './entities/approval-request.entity';
import { BranchesService } from '../branches/branches.service';

@Injectable()
export class AdminApprovalsService {
  constructor(
    @InjectRepository(ApprovalRequestEntity)
    private readonly approvalRepo: Repository<ApprovalRequestEntity>,
    private readonly branchesService: BranchesService,
  ) {}

  async list(status?: string) {
    const query = this.approvalRepo.createQueryBuilder('req');

    if (status) {
      query.where('req.status = :status', { status });
    }

    query.orderBy('req.created_at', 'DESC');

    return await query.getMany();
  }

  async getCounts() {
    const [pending, approved, rejected] = await Promise.all([
      this.approvalRepo.count({ where: { status: 'PENDING' } }),
      this.approvalRepo.count({ where: { status: 'APPROVED' } }),
      this.approvalRepo.count({ where: { status: 'REJECTED' } }),
    ]);

    return { pending, approved, rejected };
  }

  async approve(id: string, approverUserId: string, notes?: string) {
    const req = await this.approvalRepo.findOne({ where: { id } });

    if (!req) {
      throw new NotFoundException('Approval request not found');
    }

    if (req.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot approve a request with status '${req.status}'. Only PENDING requests can be approved.`,
      );
    }

    const actionResult = await this.executeApprovedAction(req, approverUserId);

    req.status = 'APPROVED';
    req.approverUserId = approverUserId;
    req.approverNotes = notes || null;
    req.approvedAt = new Date();

    const saved = await this.approvalRepo.save(req);

    return { ...saved, actionResult };
  }

  async reject(id: string, approverUserId: string, notes?: string) {
    const req = await this.approvalRepo.findOne({ where: { id } });

    if (!req) {
      throw new NotFoundException('Approval request not found');
    }

    if (req.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot reject a request with status '${req.status}'. Only PENDING requests can be rejected.`,
      );
    }

    const actionResult = await this.executeRejectedAction(
      req,
      approverUserId,
    );

    req.status = 'REJECTED';
    req.approverUserId = approverUserId;
    req.approverNotes = notes || null;
    req.approvedAt = new Date();

    const saved = await this.approvalRepo.save(req);

    return { ...saved, actionResult };
  }

  async createApprovalRequest(
    requestType: string,
    requesterUserId: string,
    targetEntityId: string,
    targetEntityType: string,
    reason?: string,
  ) {
    const req = this.approvalRepo.create({
      requestType,
      requesterUserId,
      targetEntityId,
      targetEntityType,
      reason,
      status: 'PENDING',
    });

    return await this.approvalRepo.save(req);
  }

  private async executeApprovedAction(
    req: ApprovalRequestEntity,
    approverUserId: string,
  ) {
    switch (req.requestType) {
      case 'DELETE_BRANCH':
        return this.branchesService.performDelete(
          req.targetEntityId,
          approverUserId,
          'ADMIN',
          req.reason ?? null,
        );
      default:
        return { message: 'No action executed for this request type' };
    }
  }

  private async executeRejectedAction(
    req: ApprovalRequestEntity,
    approverUserId: string,
  ) {
    switch (req.requestType) {
      case 'DELETE_BRANCH':
        return this.branchesService.revertDeleteRequest(
          req.targetEntityId,
          approverUserId,
          'ADMIN',
        );
      default:
        return { message: 'No action executed for this request type' };
    }
  }
}
