import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollRunEntity } from './entities/payroll-run.entity';

/**
 * Payroll Approval Workflow
 *
 * Status flow: DRAFT → PROCESSED → SUBMITTED → APPROVED / REJECTED
 *
 * - Payroll processor (PAYROLL role) processes and submits
 * - Approver (CLIENT/ADMIN) approves or rejects with comments
 * - Rejected runs can be reprocessed and resubmitted
 */
@Injectable()
export class PayrollApprovalService {
  constructor(
    @InjectRepository(PayrollRunEntity)
    private readonly runRepo: Repository<PayrollRunEntity>,
  ) {}

  /** Submit a processed run for approval */
  async submitForApproval(runId: string, submittedByUserId: string) {
    const run = await this.findRun(runId);

    if (run.status !== 'PROCESSED') {
      throw new BadRequestException(
        `Cannot submit: run is "${run.status}". Only PROCESSED runs can be submitted.`,
      );
    }

    run.status = 'SUBMITTED';
    run.submittedByUserId = submittedByUserId;
    run.submittedAt = new Date();
    run.approvedByUserId = null;
    run.approvedAt = null;
    run.approvalComments = null;
    run.rejectedByUserId = null;
    run.rejectedAt = null;
    run.rejectionReason = null;
    await this.runRepo.save(run);

    return {
      id: run.id,
      status: run.status,
      message: 'Run submitted for approval',
    };
  }

  /** Approve a submitted run */
  async approveRun(runId: string, approvedByUserId: string, comments?: string) {
    const run = await this.findRun(runId);

    if (run.status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Cannot approve: run is "${run.status}". Only SUBMITTED runs can be approved.`,
      );
    }

    run.status = 'APPROVED';
    run.approvedByUserId = approvedByUserId;
    run.approvedAt = new Date();
    run.approvalComments = comments ?? null;
    run.rejectedByUserId = null;
    run.rejectedAt = null;
    run.rejectionReason = null;
    await this.runRepo.save(run);

    return { id: run.id, status: run.status, message: 'Run approved' };
  }

  /** Reject a submitted run back to drafts */
  async rejectRun(runId: string, rejectedByUserId: string, reason: string) {
    const run = await this.findRun(runId);

    if (run.status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Cannot reject: run is "${run.status}". Only SUBMITTED runs can be rejected.`,
      );
    }

    if (!reason || !reason.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    run.status = 'REJECTED';
    run.rejectedByUserId = rejectedByUserId;
    run.rejectedAt = new Date();
    run.rejectionReason = reason;
    run.approvedByUserId = null;
    run.approvedAt = null;
    run.approvalComments = null;
    await this.runRepo.save(run);

    return { id: run.id, status: run.status, message: 'Run rejected', reason };
  }

  /** Revert a rejected run to DRAFT so it can be reprocessed */
  async revertToDraft(runId: string) {
    const run = await this.findRun(runId);

    if (run.status !== 'REJECTED') {
      throw new BadRequestException(
        `Cannot revert: run is "${run.status}". Only REJECTED runs can be reverted.`,
      );
    }

    run.status = 'DRAFT';
    run.submittedByUserId = null;
    run.submittedAt = null;
    run.approvedByUserId = null;
    run.approvedAt = null;
    run.approvalComments = null;
    run.rejectedByUserId = null;
    run.rejectedAt = null;
    run.rejectionReason = null;
    await this.runRepo.save(run);
    return { id: run.id, status: run.status, message: 'Run reverted to draft' };
  }

  /** Get approval status details */
  async getApprovalStatus(runId: string) {
    const run = await this.findRun(runId);
    return {
      id: run.id,
      status: run.status,
      submittedByUserId: run.submittedByUserId,
      submittedAt: run.submittedAt,
      approvedByUserId: run.approvedByUserId,
      approvedAt: run.approvedAt,
      approvalComments: run.approvalComments,
      rejectedByUserId: run.rejectedByUserId,
      rejectedAt: run.rejectedAt,
      rejectionReason: run.rejectionReason,
    };
  }

  private async findRun(runId: string): Promise<PayrollRunEntity> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }
}
