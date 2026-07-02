import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollRunEntity } from './entities/payroll-run.entity';
import { PayrollProcessingService } from './payroll-processing.service';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';

/**
 * Payroll Approval Workflow
 *
 * Status flow: DRAFT → PROCESSED → SUBMITTED → APPROVED / REJECTED
 *
 * - Payroll processor (PAYROLL role) processes and submits
 * - Approver (CCO role) approves or rejects with comments
 * - Rejected runs can be reprocessed and resubmitted
 */
@Injectable()
export class PayrollApprovalService {
  constructor(
    @InjectRepository(PayrollRunEntity)
    private readonly runRepo: Repository<PayrollRunEntity>,
    private readonly processingSvc: PayrollProcessingService,
    private readonly access: AccessScopeService,
  ) {}

  /** Submit a processed run for approval */
  async submitForApproval(
    runId: string,
    submittedByUserId: string,
    user?: ReqUser,
  ) {
    const run = await this.findRun(runId);
    if (user) await this.access.assertClientAllowed(user, run.clientId);

    if (run.status !== 'PROCESSED') {
      throw new BadRequestException(
        `Cannot submit: run is "${run.status}". Only PROCESSED runs can be submitted.`,
      );
    }

    // Pre-submit gate: leave & OT validations must be clean. Any unresolved
    // mismatch (attendance leave ≠ ESS approved, or sheet OT ≠ branch/ESS OT)
    // blocks submission with a clear, actionable message.
    const [leaveVal, otVal] = await Promise.all([
      this.processingSvc.leaveValidation(runId),
      this.processingSvc.otValidation(runId),
    ]);
    const leaveMismatches = (leaveVal?.rows ?? []).filter(
      (r: any) => r.status && r.status !== 'OK',
    );
    const otMismatches = (otVal?.rows ?? []).filter(
      (r: any) => r.status && r.status !== 'OK',
    );
    if (leaveMismatches.length || otMismatches.length) {
      const parts: string[] = [];
      if (leaveMismatches.length) {
        const sample = leaveMismatches
          .slice(0, 5)
          .map((r: any) => r.empCode)
          .join(', ');
        parts.push(
          `${leaveMismatches.length} leave mismatch(es)${leaveMismatches.length > 5 ? ` (e.g. ${sample}, …)` : ` (${sample})`}`,
        );
      }
      if (otMismatches.length) {
        const sample = otMismatches
          .slice(0, 5)
          .map((r: any) => r.empCode)
          .join(', ');
        parts.push(
          `${otMismatches.length} OT mismatch(es)${otMismatches.length > 5 ? ` (e.g. ${sample}, …)` : ` (${sample})`}`,
        );
      }
      throw new BadRequestException(
        `Cannot submit for approval until leave & OT validations are clean. Pending: ${parts.join('; ')}. Resolve each mismatch on the Leave/OT Validation screens, then try again.`,
      );
    }

    // Atomic transition: only succeed if status is still PROCESSED.
    const result = await this.runRepo.update(
      { id: runId, status: 'PROCESSED' },
      {
        status: 'SUBMITTED',
        submittedByUserId,
        submittedAt: new Date(),
        approvedByUserId: null,
        approvedAt: null,
        approvalComments: null,
        rejectedByUserId: null,
        rejectedAt: null,
        rejectionReason: null,
      },
    );
    if (!result.affected) {
      throw new BadRequestException(
        'Run state changed concurrently. Please refresh and try again.',
      );
    }

    return {
      id: runId,
      status: 'SUBMITTED' as const,
      message: 'Run submitted for approval',
    };
  }

  /** Approve a submitted run */
  async approveRun(
    runId: string,
    approvedByUserId: string,
    comments?: string,
    user?: ReqUser,
  ) {
    const run = await this.findRun(runId);
    if (user) await this.access.assertClientAllowed(user, run.clientId);

    if (run.status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Cannot approve: run is "${run.status}". Only SUBMITTED runs can be approved.`,
      );
    }

    if (user?.roleCode !== 'CCO') {
      throw new ForbiddenException('Only CCO users can approve payroll runs.');
    }

    // PD-H3: maker-checker - the user who submitted (prepared) a run cannot
    // also approve it.
    if (run.submittedByUserId && run.submittedByUserId === approvedByUserId) {
      throw new ForbiddenException(
        'You submitted this run; a different user must approve it.',
      );
    }

    const result = await this.runRepo.update(
      { id: runId, status: 'SUBMITTED' },
      {
        status: 'APPROVED',
        approvedByUserId,
        approvedAt: new Date(),
        approvalComments: comments ?? null,
        rejectedByUserId: null,
        rejectedAt: null,
        rejectionReason: null,
      },
    );
    if (!result.affected) {
      throw new BadRequestException(
        'Run state changed concurrently. Please refresh and try again.',
      );
    }

    return {
      id: runId,
      status: 'APPROVED' as const,
      message: 'Run approved',
    };
  }

  /** Reject a submitted run back to drafts */
  async rejectRun(
    runId: string,
    rejectedByUserId: string,
    reason: string,
    user?: ReqUser,
  ) {
    const run = await this.findRun(runId);
    if (user) await this.access.assertClientAllowed(user, run.clientId);

    if (run.status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Cannot reject: run is "${run.status}". Only SUBMITTED runs can be rejected.`,
      );
    }

    if (user?.roleCode !== 'CCO') {
      throw new ForbiddenException('Only CCO users can reject payroll runs.');
    }

    if (!reason || !reason.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    const result = await this.runRepo.update(
      { id: runId, status: 'SUBMITTED' },
      {
        status: 'REJECTED',
        rejectedByUserId,
        rejectedAt: new Date(),
        rejectionReason: reason,
        approvedByUserId: null,
        approvedAt: null,
        approvalComments: null,
      },
    );
    if (!result.affected) {
      throw new BadRequestException(
        'Run state changed concurrently. Please refresh and try again.',
      );
    }

    return {
      id: runId,
      status: 'REJECTED' as const,
      message: 'Run rejected',
      reason,
    };
  }

  /** Revert a rejected or approved run to DRAFT so it can be reprocessed */
  async revertToDraft(runId: string, user?: ReqUser) {
    const run = await this.findRun(runId);
    if (user) await this.access.assertClientAllowed(user, run.clientId);

    if (run.status !== 'REJECTED' && run.status !== 'APPROVED') {
      throw new BadRequestException(
        `Cannot revert: run is "${run.status}". Only REJECTED or APPROVED runs can be reverted.`,
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
  async getApprovalStatus(runId: string, user?: ReqUser) {
    const run = await this.findRun(runId);
    if (user) await this.access.assertClientAllowed(user, run.clientId);
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
