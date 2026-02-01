import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchEntity } from './entities/branch.entity';
import { BranchContractorEntity } from './entities/branch-contractor.entity';
import { UsersService } from '../users/users.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ComplianceApplicabilityService } from '../compliances/compliance-applicability.service';
import { BranchApplicableComplianceEntity } from './entities/branch-applicable-compliance.entity';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';

@Injectable()
export class BranchesService {
  constructor(
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    @InjectRepository(BranchContractorEntity)
    private readonly branchContractorRepo: Repository<BranchContractorEntity>,
    @InjectRepository(BranchApplicableComplianceEntity)
    private readonly branchApplicableComplianceRepo: Repository<BranchApplicableComplianceEntity>,
    @InjectRepository(ComplianceMasterEntity)
    private readonly complianceMasterRepo: Repository<ComplianceMasterEntity>,
    private readonly usersService: UsersService,
    private readonly auditLogs: AuditLogsService,
    private readonly complianceApplicabilityService: ComplianceApplicabilityService,
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
    return saved;
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
  ) {
    try {
      const branch = await this.findById(id);
      branch.status = 'INACTIVE';
      branch.isActive = false;
      branch.isDeleted = true;
      branch.deletedAt = new Date();
      branch.deletedBy = deletedBy ?? null;
      branch.deleteReason = reason ?? null;
      await this.branchRepo.save(branch);

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
  async saveApplicableCompliances(branchId: string, complianceIds: string[], userId: string) {
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
      throw new BadRequestException(err?.message || 'Failed to save applicable compliances');
    }
  }
}
