import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { BranchEntity } from './entities/branch.entity';
import { BranchContractorEntity } from './entities/branch-contractor.entity';
import { UsersService } from '../users/users.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ComplianceApplicabilityService } from '../compliances/compliance-applicability.service';
import { BranchApplicableComplianceEntity } from './entities/branch-applicable-compliance.entity';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { ApprovalRequestEntity } from '../admin/entities/approval-request.entity';

@Injectable()
export class BranchesService {
  private readonly logger = new Logger(BranchesService.name);

  constructor(
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    @InjectRepository(BranchContractorEntity)
    private readonly branchContractorRepo: Repository<BranchContractorEntity>,
    @InjectRepository(BranchApplicableComplianceEntity)
    private readonly branchApplicableComplianceRepo: Repository<BranchApplicableComplianceEntity>,
    @InjectRepository(ComplianceMasterEntity)
    private readonly complianceMasterRepo: Repository<ComplianceMasterEntity>,
    @InjectRepository(ApprovalRequestEntity)
    private readonly approvalRepo: Repository<ApprovalRequestEntity>,
    private readonly usersService: UsersService,
    private readonly auditLogs: AuditLogsService,
    private readonly complianceApplicabilityService: ComplianceApplicabilityService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    clientid: string,
    dto: any,
    performedBy?: string,
    performedRole?: string,
  ) {
    const employeeCount = Number(dto.employeeCount ?? 0) || 0;
    const contractorCount = Number(dto.contractorCount ?? 0) || 0;

    const headcount =
      dto.headcount != null
        ? Number(dto.headcount) || 0
        : employeeCount + contractorCount;

    const branch = this.branchRepo.create({
      clientId: clientid,
      branchName: dto.branchName,
      branchType: dto.branchType || 'HO',
      stateCode: dto.stateCode ?? null,
      establishmentType: dto.establishmentType || 'BRANCH',
      city: dto.city ?? null,
      pincode: dto.pincode ?? null,
      headcount,
      address: dto.address || '',
      employeeCount,
      contractorCount,
      status: dto.status || 'ACTIVE',
      isActive: true,
      isDeleted: false,
    });
    const saved = await this.branchRepo.save(branch);
    await this.complianceApplicabilityService.recomputeForBranch(saved.id);
    await this.auditLogs.log({
      entityType: 'BRANCH',
      entityId: saved.id,
      action: 'CREATE',
      performedBy: performedBy ?? null,
      performedRole: performedRole ?? null,
      afterJson: saved as any,
    });

    // Auto-create branch user if branchUserName + branchUserEmail provided
    let branchUser: { email: string; password: string; userId: string } | null =
      null;
    let branchUserError: string | null = null;

    if (dto.branchUserName && dto.branchUserEmail) {
      branchUser = await this.createBranchUser(
        clientid,
        saved.id,
        dto.branchUserName,
        dto.branchUserEmail,
        dto.branchUserPassword,
      ).catch((err: any) => {
        // Do not fail branch creation if branch-user auto-provisioning fails (e.g., duplicate email/FK issues)
        branchUserError = err?.message || 'Failed to auto-create branch user';
        this.logger.warn(
          `Branch created but branch user could not be auto-created (branchId=${saved.id}): ${branchUserError}`,
        );
        return null;
      });
    }

    return { ...saved, branchUser, branchUserError };
  }

  /**
   * Create a CLIENT user with userType=BRANCH and link to the given branch.
   * Auto-generates a password if none provided.
   */
  private async createBranchUser(
    clientId: string,
    branchId: string,
    name: string,
    email: string,
    password?: string,
  ): Promise<{ email: string; password: string; userId: string }> {
    // Guard: ensure branch exists before linking
    const branchExists = await this.branchRepo.findOne({ where: { id: branchId } });
    if (!branchExists) {
      throw new BadRequestException(
        `Cannot create branch user: branch ${branchId} not found`,
      );
    }

    // Generate password if not provided: Br@<4-digit random><year>
    const plainPassword =
      password ||
      `Br@${Math.floor(1000 + Math.random() * 9000)}${new Date().getFullYear()}`;

    // Look up CLIENT role
    const roleId = await this.usersService.getRoleId('CLIENT');

    // Check duplicate email
    const existingUser = await this.dataSource.query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email],
    );
    if (existingUser?.length) {
      throw new BadRequestException(
        `A user with email "${email}" already exists. Cannot auto-create branch user.`,
      );
    }

    // Create user via UsersService.createUser (handles hashing, userCode, user_branches insert)
    const result = await this.usersService.createUser({
      roleId,
      name,
      email,
      password: plainPassword,
      clientId,
      userType: 'BRANCH',
      branchIds: [branchId],
    } as any);

    return {
      email: email.toLowerCase(),
      password: plainPassword,
      userId: result.id,
    };
  }

  async findByClient(clientId: string, includeDeleted = false) {
    return this.branchRepo.find({
      where: includeDeleted ? { clientId } : { clientId, isDeleted: false },
      order: { id: 'ASC' },
    });
  }

  async findById(id: string, includeDeleted = false) {
    const branch = await this.branchRepo.findOne({
      where: includeDeleted ? { id } : { id, isDeleted: false },
    });
    if (!branch) throw new NotFoundException(`Branch ${id} not found`);
    return branch;
  }

  async update(id: string, dto: any) {
    const branch = await this.findById(id);

    // Protect immutable fields
    const {
      id: _id,
      clientId: _clientId,
      createdAt: _createdAt,
      ...safe
    } = dto ?? {};
    Object.assign(branch, safe);

    // If headcount not provided, keep it in sync when employee/contractor counts change
    const employeeCount = branch.employeeCount ?? 0;
    const contractorCount = branch.contractorCount ?? 0;

    if (
      dto?.headcount == null &&
      (dto?.employeeCount != null || dto?.contractorCount != null)
    ) {
      branch.headcount = Number(employeeCount) + Number(contractorCount);
    }
    const saved = await this.branchRepo.save(branch);
    await this.complianceApplicabilityService.recomputeForBranch(saved.id);
    return saved;
  }

  async delete(
    id: string,
    deletedBy?: string,
    deletedRole?: string,
    reason?: string | null,
    mode: 'request' | 'force' = 'request',
  ) {
    if (mode === 'force') {
      return this.performDelete(id, deletedBy, deletedRole, reason);
    }
    return this.requestDelete(id, deletedBy, deletedRole, reason);
  }

  private async requestDelete(
    id: string,
    requestedBy?: string,
    requestedRole?: string,
    reason?: string | null,
  ) {
    if (!requestedBy) {
      throw new BadRequestException('requesting user is required');
    }

    const branch = await this.findById(id, true);
    if (branch.isDeleted) {
      throw new BadRequestException('Branch is already deleted');
    }

    const existing = await this.approvalRepo.findOne({
      where: {
        targetEntityId: id,
        targetEntityType: 'BRANCH',
        requestType: 'DELETE_BRANCH',
        status: 'PENDING',
      },
    });
    if (existing) {
      return {
        message: 'Delete request already pending approval',
        requestId: existing.id,
        status: existing.status,
      };
    }

    branch.status = 'PENDING_DELETE';
    branch.deleteReason = reason ?? null;
    await this.branchRepo.save(branch);

    const approval = this.approvalRepo.create({
      requestType: 'DELETE_BRANCH',
      requesterUserId: requestedBy,
      targetEntityId: branch.id,
      targetEntityType: 'BRANCH',
      reason: reason ?? null,
      status: 'PENDING',
    });
    const savedApproval = await this.approvalRepo.save(approval);

    await this.auditLogs.log({
      entityType: 'BRANCH',
      entityId: branch.id,
      action: 'DELETE_REQUEST',
      performedBy: requestedBy ?? null,
      performedRole: requestedRole ?? null,
      reason: reason ?? null,
      afterJson: { status: branch.status, deleteReason: branch.deleteReason },
    });

    return {
      message: 'Delete request submitted for approval',
      requestId: savedApproval.id,
      status: savedApproval.status,
    };
  }

  async performDelete(
    id: string,
    deletedBy?: string,
    deletedRole?: string,
    reason?: string | null,
  ) {
    try {
      const branch = await this.findById(id, true);

      if (branch.isDeleted) {
        return { message: 'Branch already deleted' };
      }

      branch.status = 'INACTIVE';
      branch.isActive = false;
      branch.isDeleted = true;
      branch.deletedAt = new Date();
      branch.deletedBy = deletedBy ?? null;
      branch.deleteReason = reason ?? branch.deleteReason ?? null;
      await this.branchRepo.save(branch);

      // Deactivate branch-linked users (auto-created branch users)
      await this.deactivateBranchUsers(branch.id);

      await this.auditLogs.log({
        entityType: 'BRANCH',
        entityId: branch.id,
        action: 'SOFT_DELETE',
        performedBy: deletedBy ?? null,
        performedRole: deletedRole ?? null,
        reason: reason ?? null,
        afterJson: {
          isDeleted: branch.isDeleted,
          deletedAt: branch.deletedAt,
          deletedBy: branch.deletedBy,
          deleteReason: branch.deleteReason,
        },
      });

      return { message: 'Branch soft-deleted' };
    } catch (err) {
      console.error('Error deleting branch:', err);
      throw new BadRequestException(err?.message || 'Failed to delete branch');
    }
  }

  async revertDeleteRequest(
    id: string,
    approverUserId?: string,
    approverRole?: string,
  ) {
    const branch = await this.findById(id, true);
    if (branch.isDeleted) {
      return { message: 'Branch already deleted; cannot revert request' };
    }

    if (branch.status === 'PENDING_DELETE') {
      branch.status = 'ACTIVE';
      branch.deleteReason = null;
      await this.branchRepo.save(branch);

      await this.auditLogs.log({
        entityType: 'BRANCH',
        entityId: branch.id,
        action: 'DELETE_REJECT',
        performedBy: approverUserId ?? null,
        performedRole: approverRole ?? null,
        afterJson: { status: branch.status },
      });
    }

    return { message: 'Delete request reverted' };
  }

  async restore(id: string, restoredBy?: string, restoredRole?: string) {
    const branch = await this.findById(id, true);
    branch.status = 'ACTIVE';
    branch.isActive = true;
    branch.isDeleted = false;
    branch.deletedAt = null;
    branch.deletedBy = null;
    branch.deleteReason = null;
    await this.branchRepo.save(branch);

    await this.auditLogs.log({
      entityType: 'BRANCH',
      entityId: branch.id,
      action: 'RESTORE',
      performedBy: restoredBy ?? null,
      performedRole: restoredRole ?? null,
      afterJson: { isDeleted: false },
    });

    return { message: 'Branch restored' };
  }

  // Deactivate branch-linked users when the branch is deleted; if a user still has other branch mappings, only unlink this branch
  private async deactivateBranchUsers(branchId: string) {
    const rows: { user_id: string }[] = await this.dataSource.query(
      `SELECT user_id FROM user_branches WHERE branch_id = $1`,
      [branchId],
    );

    if (!rows?.length) return;

    for (const row of rows) {
      const userId = row.user_id;

      const branchRows: { branch_id: string }[] = await this.dataSource.query(
        `SELECT branch_id FROM user_branches WHERE user_id = $1`,
        [userId],
      );
      const otherBranchIds = branchRows
        .map((r) => r.branch_id)
        .filter((id) => id !== branchId);

      // If user has other branch mappings, only remove this branch link and keep the user active
      if (otherBranchIds.length > 0) {
        await this.dataSource.query(
          `DELETE FROM user_branches WHERE user_id = $1 AND branch_id = $2`,
          [userId, branchId],
        );
        this.logger.log(
          `Removed branch mapping for user ${userId} on branch ${branchId} (user remains active; still mapped to ${otherBranchIds.length} branch(es))`,
        );
        continue;
      }

      const timestamp = Date.now();
      await this.dataSource.query(
        `UPDATE users
           SET is_active = false,
               deleted_at = NOW(),
               mobile = NULL,
               email = CASE
                 WHEN email LIKE '%#deleted#%' THEN email
                 WHEN email LIKE '%#branch-deleted#%' THEN email
                 ELSE email || '#branch-deleted#' || $2 || '#' || $3
               END
         WHERE id = $1`,
        [userId, branchId, timestamp],
      );

      await this.dataSource.query(
        `DELETE FROM user_branches WHERE user_id = $1 AND branch_id = $2`,
        [userId, branchId],
      );

      this.logger.log(
        `Soft-deactivated branch user ${userId} after branch ${branchId} deletion`,
      );
    }
  }

  // ---- Contractors per branch ----

  async listContractors(branchId: string) {
    const branch = await this.findById(branchId);

    const links = await this.branchContractorRepo.find({
      where: { branchId: branch.id },
      relations: ['contractor'],
      order: { id: 'ASC' },
    });

    return links.map((link) => ({
      id: link.id,
      branchId: link.branchId,
      clientId: link.clientId,
      userId: link.contractorUserId,
      name: link.contractor?.name,
      email: link.contractor?.email,
      mobile: link.contractor?.mobile,
      createdAt: link.createdAt,
    }));
  }

  async addContractor(branchId: string, contractorUserId: string) {
    const branch = await this.findById(branchId);

    // Validate user has CONTRACTOR role
    const roleCode = await this.usersService.getUserRoleCode(contractorUserId);
    if (roleCode !== 'CONTRACTOR') {
      throw new BadRequestException(
        `User ${contractorUserId} is not a CONTRACTOR user`,
      );
    }

    // Enforce client-scoped contractor login:
    // first link fixes the contractor's clientid; later links must match.
    await this.usersService.ensureUserClientScope(
      contractorUserId,
      branch.clientId,
    );

    // Prevent duplicates on (branchId, contractorUserId)
    const existing = await this.branchContractorRepo.findOne({
      where: { branchId: branch.id, contractorUserId },
    });
    if (existing) {
      throw new BadRequestException('Contractor already linked to this branch');
    }

    const link = this.branchContractorRepo.create({
      branchId: branch.id,
      clientId: branch.clientId,
      contractorUserId,
    });
    const saved = await this.branchContractorRepo.save(link);
    return { id: saved.id, message: 'Contractor linked to branch' };
  }

  async removeContractor(branchId: string, contractorUserId: string) {
    const branch = await this.findById(branchId);

    const link = await this.branchContractorRepo.findOne({
      where: { branchId: branch.id, contractorUserId },
    });

    if (!link) {
      throw new NotFoundException('Branch-contractor link not found');
    }

    await this.branchContractorRepo.remove(link);
    return { message: 'Contractor unlinked from branch' };
  }

  // --- Admin: List all applicable compliances for a branch ---
  async listApplicableCompliances(branchId: string) {
    // Get all mappings for this branch
    const mappings = await this.branchApplicableComplianceRepo.find({
      where: { branchId, isApplicable: true },
      select: ['complianceId'],
    });
    return mappings.map((m) => m.complianceId);
  }

  // --- Admin: Save applicable compliances for a branch ---
  async saveApplicableCompliances(
    branchId: string,
    complianceIds: string[],
    userId: string,
  ) {
    try {
      // Check if branch exists
      const branch = await this.branchRepo.findOne({ where: { id: branchId } });
      if (!branch) {
        throw new NotFoundException(`Branch ${branchId} does not exist`);
      }
      // Remove old
      await this.branchApplicableComplianceRepo.delete({ branchId });
      // Insert new
      if (Array.isArray(complianceIds) && complianceIds.length) {
        const mappings = complianceIds.map((complianceId) =>
          this.branchApplicableComplianceRepo.create({
            branchId,
            complianceId,
            isApplicable: true,
            createdBy: userId,
          }),
        );
        await this.branchApplicableComplianceRepo.save(mappings);
      }
      return { ok: true };
    } catch (err) {
      console.error('Error saving applicable compliances:', err);
      if (err instanceof NotFoundException) throw err;
      throw new BadRequestException(
        err?.message || 'Failed to save applicable compliances',
      );
    }
  }
}
