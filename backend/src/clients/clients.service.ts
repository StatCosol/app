import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ClientEntity } from './entities/client.entity';
import { ClientUserEntity } from './entities/client-user.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UsersService } from '../users/users.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UserEntity } from '../users/entities/user.entity';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);
  constructor(
    @InjectRepository(ClientEntity)
    private readonly repo: Repository<ClientEntity>,
    @InjectRepository(ClientUserEntity)
    private readonly clientUserRepo: Repository<ClientUserEntity>,
    private readonly usersService: UsersService,
    private readonly auditLogs: AuditLogsService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateClientDto, createdBy?: string, createdRole?: string) {
    this.logger.log('[create] Received DTO:', {
      clientCode: dto.clientCode,
      clientName: dto.clientName,
    });

    // ── Validate master user field group completeness ───────
    const hasMasterFields = !!(
      dto.masterUserName ||
      dto.masterUserEmail ||
      dto.masterUserPassword
    );
    const hasAllMasterFields = !!(
      dto.masterUserName &&
      dto.masterUserEmail &&
      dto.masterUserPassword
    );
    if (hasMasterFields && !hasAllMasterFields) {
      throw new BadRequestException(
        'masterUserName, masterUserEmail, and masterUserPassword are all required when creating a master user',
      );
    }

    const trimmedCode = (dto.clientCode || '').trim();
    const clientCode = trimmedCode || `C${Date.now()}`;

    if (clientCode) {
      const existing = await this.repo
        .createQueryBuilder('c')
        .where('LOWER(c.clientCode) = LOWER(:code)', { code: clientCode })
        .getOne();

      if (existing) {
        if (!existing.isDeleted) {
          const sameName =
            (existing.clientName || '').trim().toLowerCase() ===
            (dto.clientName || '').trim().toLowerCase();

          if (sameName) {
            return {
              id: existing.id,
              message: 'Client already exists (idempotent create)',
            };
          }

          throw new BadRequestException(
            'Client code already exists. Please use a unique code.',
          );
        }

        // If the code exists but is soft-deleted, restore/reuse it instead of failing
        existing.clientName = dto.clientName;
        existing.status = 'ACTIVE';
        existing.isActive = true;
        existing.isDeleted = false;
        existing.deletedAt = null;
        existing.deletedBy = null;
        existing.deleteReason = null;
        existing.assignedCrmId =
          dto.assignedCrmId ?? existing.assignedCrmId ?? null;
        existing.assignedAuditorId =
          dto.assignedAuditorId ?? existing.assignedAuditorId ?? null;

        const restored = await this.repo.save(existing);
        await this.auditLogs.log({
          entityType: 'CLIENT',
          entityId: restored.id,
          action: 'RESTORE',
          performedBy: createdBy ?? null,
          performedRole: createdRole ?? null,
          afterJson: restored as unknown as Record<string, unknown>,
        });
        return { id: restored.id, message: 'Client restored (code reused)' };
      }
    }

    // Optional: if IDs are provided, validate now itself
    if (dto.assignedCrmId) {
      const crmRole = await this.usersService.getUserRoleCode(
        dto.assignedCrmId,
      );
      if (crmRole !== 'CRM')
        throw new BadRequestException(
          `assignedCrmId ${dto.assignedCrmId} is not a CRM user`,
        );
    }
    if (dto.assignedAuditorId) {
      const audRole = await this.usersService.getUserRoleCode(
        dto.assignedAuditorId,
      );
      if (audRole !== 'AUDITOR')
        throw new BadRequestException(
          `assignedAuditorId ${dto.assignedAuditorId} is not an AUDITOR user`,
        );
    }

    const clientData = {
      clientCode,
      clientName: dto.clientName,
      status: 'ACTIVE',
      isActive: true,
      isDeleted: false,
      assignedCrmId: dto.assignedCrmId ?? null,
      assignedAuditorId: dto.assignedAuditorId ?? null,
      registeredAddress: dto.registeredAddress ?? null,
      state: dto.state ?? null,
      industry: dto.industry ?? null,
      primaryContactName: dto.primaryContactName ?? null,
      primaryContactEmail: dto.primaryContactEmail ?? null,
      primaryContactMobile: dto.primaryContactMobile ?? null,
      companyCode: dto.companyCode ?? null,
    };

    // ── Atomic transaction: create client + master user together ──
    if (hasAllMasterFields) {
      const result = await this.dataSource.transaction(async (manager) => {
        const clientRepo = manager.getRepository(ClientEntity);
        const clientUserRepo = manager.getRepository(ClientUserEntity);

        const client = clientRepo.create(clientData);
        let saved;
        try {
          saved = await clientRepo.save(client);
        } catch (err: unknown) {
          const pgErr = err as { code?: string; detail?: string };
          if (pgErr.code === '23505' && pgErr.detail?.includes('client_code')) {
            throw new BadRequestException(
              'Client code already exists. Please use a unique code.',
            );
          }
          throw err;
        }

        // Create master user within the same transaction
        const masterUser = await this.usersService.createMasterUserForClient(
          manager,
          {
            name: dto.masterUserName!,
            email: dto.masterUserEmail!,
            mobile: dto.masterUserMobile ?? null,
            password: dto.masterUserPassword!,
            clientId: saved.id,
          },
        );

        // Link master user in client_users join table
        const clientUserLink = clientUserRepo.create({
          clientId: saved.id,
          userId: masterUser.id,
        });
        await clientUserRepo.save(clientUserLink);

        return { saved, masterUser };
      });

      this.logger.log('[create] Saved client + master user to DB:', {
        clientCode: result.saved.clientCode,
        clientName: result.saved.clientName,
        masterUserId: result.masterUser.id,
        masterUserEmail: result.masterUser.email,
      });

      await this.auditLogs.log({
        entityType: 'CLIENT',
        entityId: result.saved.id,
        action: 'CREATE',
        performedBy: createdBy ?? null,
        performedRole: createdRole ?? null,
        afterJson: result.saved,
      });

      return {
        id: result.saved.id,
        message: 'Client created with master user',
        masterUserId: result.masterUser.id,
        masterUserEmail: result.masterUser.email,
      };
    }

    // ── Legacy path: create client without master user ──────
    const client = this.repo.create(clientData);

    this.logger.log('[create] Created entity:', {
      clientCode: client.clientCode,
      clientName: client.clientName,
    });
    let saved;
    try {
      saved = await this.repo.save(client);
    } catch (err: unknown) {
      const pgErr = err as { code?: string; detail?: string };
      // Handle duplicate client_code error
      if (
        pgErr.code === '23505' &&
        pgErr.detail &&
        pgErr.detail.includes('client_code')
      ) {
        throw new BadRequestException(
          'Client code already exists. Please use a unique code.',
        );
      }
      throw err;
    }
    this.logger.log('[create] Saved to DB:', {
      clientCode: saved.clientCode,
      clientName: saved.clientName,
    });
    await this.auditLogs.log({
      entityType: 'CLIENT',
      entityId: saved.id,
      action: 'CREATE',
      performedBy: createdBy ?? null,
      performedRole: createdRole ?? null,
      afterJson: saved,
    });
    return { id: saved.id, message: 'Client created' };
  }

  async listClients(includeDeleted = false) {
    // Return only ACTIVE & not deleted clients by default
    const where = includeDeleted ? {} : { isDeleted: false };
    const clients = await this.repo.find({
      select: ['id', 'clientName', 'clientCode', 'status', 'logoUrl', 'crmOnBehalfEnabled'],
      where,
      order: { id: 'DESC' },
    });

    // Aggregate branches, employees, and contractors for each client
    const branchRepo = this.repo.manager.getRepository(BranchEntity);
    const aggResults = await branchRepo
      .createQueryBuilder('branch')
      .select('branch.clientid', 'clientId')
      .addSelect('COUNT(DISTINCT branch.id)', 'branchesCount')
      .addSelect('COALESCE(SUM(branch.employeecount), 0)', 'totalEmployees')
      .addSelect('COALESCE(SUM(branch.contractorcount), 0)', 'contractorsCount')
      .where('branch.isdeleted = :no AND branch.isactive = :yes', {
        no: false,
        yes: true,
      })
      .groupBy('branch.clientid')
      .getRawMany();

    // Map aggregation results by clientId
    const aggMap = new Map();
    aggResults.forEach((row) => {
      aggMap.set(row.clientId, {
        branchesCount: Number(row.branchesCount),
        totalEmployees: Number(row.totalEmployees),
        contractorsCount: Number(row.contractorsCount),
      });
    });

    // Attach aggregation to client list
    return clients.map((client) => ({
      ...client,
      branchesCount: aggMap.get(client.id)?.branchesCount || 0,
      totalEmployees: aggMap.get(client.id)?.totalEmployees || 0,
      contractorsCount: aggMap.get(client.id)?.contractorsCount || 0,
    }));
  }

  async getOrFail(clientId: string, includeDeleted = false) {
    const client = await this.repo.findOne({
      where: includeDeleted
        ? { id: clientId }
        : { id: clientId, isDeleted: false },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async getClientDetails(clientId: string) {
    return this.getOrFail(clientId);
  }

  async update(
    clientId: string,
    dto: Partial<CreateClientDto>,
    updatedBy?: string,
    updatedRole?: string,
  ) {
    const client = await this.getOrFail(clientId);
    const before = { ...client } as unknown as Record<string, unknown>;

    // Only update provided fields
    if (dto.clientName !== undefined) client.clientName = dto.clientName;
    if (dto.registeredAddress !== undefined)
      client.registeredAddress = dto.registeredAddress ?? null;
    if (dto.state !== undefined) client.state = dto.state ?? null;
    if (dto.industry !== undefined) client.industry = dto.industry ?? null;
    if (dto.primaryContactName !== undefined)
      client.primaryContactName = dto.primaryContactName ?? null;
    if (dto.primaryContactEmail !== undefined)
      client.primaryContactEmail = dto.primaryContactEmail ?? null;
    if (dto.primaryContactMobile !== undefined)
      client.primaryContactMobile = dto.primaryContactMobile ?? null;
    if (dto.companyCode !== undefined)
      client.companyCode = dto.companyCode ?? null;
    if (dto.status !== undefined) client.status = dto.status;

    const saved = await this.repo.save(client);

    await this.auditLogs.log({
      entityType: 'CLIENT',
      entityId: saved.id,
      action: 'UPDATE',
      performedBy: updatedBy ?? null,
      performedRole: updatedRole ?? null,
      beforeJson: before,
      afterJson: saved as unknown as Record<string, unknown>,
    });

    return saved;
  }

  async toggleCrmOnBehalf(
    clientId: string,
    enabled: boolean,
    performedBy?: string,
    performedRole?: string,
  ) {
    const client = await this.getOrFail(clientId);
    const before = { crmOnBehalfEnabled: client.crmOnBehalfEnabled };
    client.crmOnBehalfEnabled = enabled;
    const saved = await this.repo.save(client);

    await this.auditLogs.log({
      entityType: 'CLIENT',
      entityId: saved.id,
      action: 'UPDATE',
      performedBy: performedBy ?? null,
      performedRole: performedRole ?? null,
      beforeJson: before,
      afterJson: { crmOnBehalfEnabled: saved.crmOnBehalfEnabled },
    });

    return saved;
  }

  /**
   * Returns a readiness checklist for a given client — everything needed for
   * go-live, with pass/fail per item and detailed counts.
   */
  async getReadinessCheck(clientId: string) {
    const client = await this.getOrFail(clientId);

    // 1) Master user exists?
    const masterUserRows: Array<{ cnt: string }> = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt FROM users
       WHERE client_id = $1 AND user_type = 'MASTER'
         AND deleted_at IS NULL AND is_active = true`,
      [clientId],
    );
    const masterUserCount = Number(masterUserRows[0]?.cnt ?? 0);

    // 2) At least 1 branch?
    const branchRows: Array<{ cnt: string }> = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt FROM client_branches
       WHERE clientid = $1 AND isdeleted = false`,
      [clientId],
    );
    const branchCount = Number(branchRows[0]?.cnt ?? 0);

    // 3) Branch users mapped? + unmapped count
    const branchUserMappedRows: Array<{ cnt: string }> =
      await this.dataSource.query(
        `SELECT COUNT(DISTINCT u.id) AS cnt FROM users u
         JOIN user_branches ub ON ub.user_id = u.id
         WHERE u.client_id = $1 AND u.user_type = 'BRANCH'
           AND u.deleted_at IS NULL AND u.is_active = true`,
        [clientId],
      );
    const branchUsersMapped = Number(branchUserMappedRows[0]?.cnt ?? 0);

    const totalBranchUserRows: Array<{ cnt: string }> =
      await this.dataSource.query(
        `SELECT COUNT(*) AS cnt FROM users
         WHERE client_id = $1 AND user_type = 'BRANCH'
           AND deleted_at IS NULL AND is_active = true`,
        [clientId],
      );
    const totalBranchUsers = Number(totalBranchUserRows[0]?.cnt ?? 0);
    const unmappedUsers = Math.max(0, totalBranchUsers - branchUsersMapped);

    // 4) Payroll user exists?
    const payrollRows: Array<{ cnt: string }> = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt FROM payroll_client_assignments
       WHERE client_id = $1 AND status = 'ACTIVE'`,
      [clientId],
    );
    const payrollCount = Number(payrollRows[0]?.cnt ?? 0);

    // 5) CRM assigned?
    const crmRows: Array<{ cnt: string }> = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt FROM client_assignments_current
       WHERE client_id = $1 AND assignment_type = 'CRM'
         AND assigned_to_user_id IS NOT NULL`,
      [clientId],
    );
    const hasCrmAssignment = Number(crmRows[0]?.cnt ?? 0) > 0;

    // 6) Compliance masters configured? (at least 1 applicable compliance)
    const complianceRows: Array<{ cnt: string }> = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt FROM branch_applicable_compliances bac
       JOIN client_branches cb ON cb.id = bac.branch_id
       WHERE cb.clientid = $1 AND cb.isdeleted = false`,
      [clientId],
    );
    const complianceCount = Number(complianceRows[0]?.cnt ?? 0);

    // 7) Storage / upload directory writable?
    let storageOk = false;
    const uploadPath = 'uploads/';
    try {
      const fs = await import('fs');
      const path = await import('path');
      const dir = path.join(process.cwd(), uploadPath);
      fs.accessSync(dir, fs.constants.W_OK);
      storageOk = true;
    } catch (e) {
      this.logger.warn('Upload directory not writable', (e as Error)?.message);
      storageOk = false;
    }

    const checks = {
      masterUser: { ok: masterUserCount > 0, count: masterUserCount },
      branches: { ok: branchCount > 0, count: branchCount },
      branchUsers: {
        ok: branchUsersMapped > 0,
        count: branchUsersMapped,
        unmappedUsers,
      },
      payrollUser: { ok: payrollCount > 0, count: payrollCount },
      crmAssigned: { ok: hasCrmAssignment },
      masters: {
        compliances: { ok: complianceCount > 0, count: complianceCount },
      },
      storage: { ok: storageOk, path: uploadPath, writable: storageOk },
    };

    const ready =
      checks.masterUser.ok &&
      checks.branches.ok &&
      checks.branchUsers.ok &&
      checks.payrollUser.ok &&
      checks.crmAssigned.ok &&
      checks.masters.compliances.ok;

    return {
      clientId,
      clientName: client.clientName,
      ready,
      checks,
    };
  }

  async assignCrmAuditor(
    clientId: string,
    assignedCrmId: string,
    assignedAuditorId: string,
  ) {
    const client = await this.getOrFail(clientId);

    const crmRole = await this.usersService.getUserRoleCode(assignedCrmId);
    if (crmRole !== 'CRM') {
      throw new BadRequestException(
        `assignedCrmId ${assignedCrmId} is not a CRM user`,
      );
    }

    const auditorRole =
      await this.usersService.getUserRoleCode(assignedAuditorId);
    if (auditorRole !== 'AUDITOR') {
      throw new BadRequestException(
        `assignedAuditorId ${assignedAuditorId} is not an AUDITOR user`,
      );
    }

    client.assignedCrmId = assignedCrmId;
    client.assignedAuditorId = assignedAuditorId;

    await this.repo.save(client);
    return { message: 'Client assignments updated', clientId };
  }

  async updateLogo(clientId: string, logoUrl: string | null) {
    const client = await this.repo.findOne({
      where: { id: clientId, isDeleted: false },
    });
    if (!client) throw new NotFoundException('Client not found');
    client.logoUrl = logoUrl;
    await this.repo.save(client);
    return { message: 'Logo updated', clientId, logoUrl };
  }

  async findById(id: string, includeDeleted = false) {
    return this.repo.findOne({
      select: ['id', 'clientName', 'clientCode', 'status', 'logoUrl', 'crmOnBehalfEnabled'],
      where: includeDeleted ? { id } : { id, isDeleted: false },
    });
  }

  /**
   * Request deletion of a client. Actual deactivation will occur only after
   * CEO approval via the deletion approvals workflow.
   */
  async softDelete(
    clientId: string,
    deletedBy?: string,
    deletedRole?: string,
    reason?: string | null,
  ) {
    const now = new Date();

    const result = await this.dataSource.transaction(async (m) => {
      const clientRepo = m.getRepository(ClientEntity);
      const userRepo = m.getRepository(UserEntity);
      const branchRepo = m.getRepository(BranchEntity);

      const client = await clientRepo.findOne({
        where: { id: clientId, isDeleted: false },
      });
      if (!client) throw new NotFoundException('Client not found');

      // Soft delete client
      Object.assign(client, {
        isDeleted: true,
        isActive: false,
        status: 'INACTIVE',
        deletedAt: now,
        deletedBy: deletedBy ?? null,
        deleteReason: reason ?? null,
      });
      await clientRepo.save(client);

      // Soft delete branches for this client
      const branches = await branchRepo.find({
        select: ['id'],
        where: { clientId },
      });
      const branchIds = branches.map((b) => b.id);

      if (branchIds.length) {
        await branchRepo.update(
          { id: In(branchIds) },
          {
            isDeleted: true,
            isActive: false,
            status: 'INACTIVE',
            deletedAt: now,
            deletedBy: deletedBy ?? null,
            deleteReason: reason ?? null,
          },
        );

        // Collect branch user ids before removing mappings
        const branchUserRows: Array<{ user_id: string }> = await m.query(
          `SELECT DISTINCT user_id FROM user_branches WHERE branch_id = ANY($1::uuid[])`,
          [branchIds],
        );
        const branchUserIds = branchUserRows.map((r) => r.user_id);

        // Remove branch mappings
        await m.query(
          `DELETE FROM user_branches WHERE branch_id = ANY($1::uuid[])`,
          [branchIds],
        );

        if (branchUserIds.length) {
          await userRepo.update(
            { id: In(branchUserIds) },
            { isActive: false, deletedAt: now },
          );
        }
      }

      // Soft delete client master users and contractors tied to this client
      await userRepo.update(
        { clientId, role: 'CLIENT' },
        { isActive: false, deletedAt: now },
      );
      await userRepo.update(
        { clientId, role: 'CONTRACTOR' },
        { isActive: false, deletedAt: now },
      );

      return client.id;
    });

    await this.auditLogs.log({
      entityType: 'CLIENT',
      entityId: result,
      action: 'SOFT_DELETE',
      performedBy: deletedBy ?? null,
      performedRole: deletedRole ?? null,
      reason: reason ?? null,
      afterJson: {
        isDeleted: true,
        deletedAt: now,
        deletedBy: deletedBy ?? null,
        deleteReason: reason ?? null,
      },
    });

    return { id: result, message: 'Client soft-deleted' };
  }

  async restore(clientId: string, restoredBy?: string, restoredRole?: string) {
    const client = await this.getOrFail(clientId, true);
    client.isDeleted = false;
    client.isActive = true;
    client.status = 'ACTIVE';
    client.deletedAt = null;
    client.deletedBy = null;
    client.deleteReason = null;
    await this.repo.save(client);

    await this.auditLogs.log({
      entityType: 'CLIENT',
      entityId: client.id,
      action: 'RESTORE',
      performedBy: restoredBy ?? null,
      performedRole: restoredRole ?? null,
      afterJson: { isDeleted: false, deletedAt: null },
    });

    return { id: client.id, message: 'Client restored' };
  }

  async updateAssignedCrm(clientId: string, crmId: string | null) {
    const client = await this.getOrFail(clientId);
    client.assignedCrmId = crmId ?? null;
    await this.repo.save(client);
    return client;
  }

  async updateAssignedAuditor(clientId: string, auditorId: string | null) {
    const client = await this.getOrFail(clientId);
    client.assignedAuditorId = auditorId ?? null;
    await this.repo.save(client);
    return client;
  }

  async addClientUser(clientId: string, userId: string) {
    await this.getOrFail(clientId);

    // Validate user has CLIENT role
    const role = await this.usersService.getUserRoleCode(userId);
    if (role !== 'CLIENT') {
      throw new BadRequestException(`User ${userId} is not a CLIENT user`);
    }

    // Check if user is already linked to another client
    const existing = await this.clientUserRepo.findOne({ where: { userId } });
    if (existing) {
      throw new BadRequestException(
        `User ${userId} is already linked to client ${existing.clientId}`,
      );
    }

    const clientUser = this.clientUserRepo.create({ clientId, userId });
    await this.clientUserRepo.save(clientUser);

    return { message: 'User linked to client', clientId, userId };
  }

  async listClientUsers(clientId: string) {
    await this.getOrFail(clientId);

    const links = await this.clientUserRepo.find({
      where: { clientId },
      relations: ['user'],
    });

    return links.map((link) => ({
      id: link.id,
      userId: link.userId,
      name: link.user.name,
      email: link.user.email,
      mobile: link.user.mobile,
      createdAt: link.createdAt,
    }));
  }

  async removeClientUser(clientId: string, userId: string) {
    const link = await this.clientUserRepo.findOne({
      where: { clientId, userId },
    });

    if (!link) {
      throw new NotFoundException('Client-user link not found');
    }

    await this.clientUserRepo.remove(link);
    return { message: 'User unlinked from client' };
  }

  async listClientUsersWithClient() {
    const links = await this.clientUserRepo.find({
      relations: ['client', 'user'],
      order: { clientId: 'ASC' },
    });

    return links
      .filter((link) => !link.client.isDeleted)
      .map((link) => ({
        clientId: link.clientId,
        clientName: link.client.clientName,
        clientCode: link.client.clientCode,
        status: link.client.status,
        userId: link.userId,
        userName: link.user.name,
        userEmail: link.user.email,
        userMobile: link.user.mobile,
      }));
  }
}
