import {
  BadRequestException,
  ForbiddenException,
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

  async listClients(includeDeleted = false, ownerCcoId?: string | null) {
    // Return only ACTIVE & not deleted clients by default. When `ownerCcoId`
    // is supplied (CCO-scoped endpoints), restrict to clients whose assigned
    // CRM is owned by this CCO. Admins / global callers should pass `null`
    // / undefined to skip the scope filter.
    const qb = this.repo.createQueryBuilder('client').orderBy('client.id', 'DESC');
    if (!includeDeleted) {
      qb.andWhere('client.isDeleted = :no', { no: false });
    }
    if (ownerCcoId) {
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM users u
           WHERE u.id = client.assignedCrmId AND u.owner_cco_id = :ccoId
         )`,
        { ccoId: ownerCcoId },
      );
    }
    qb.select([
      'client.id',
      'client.clientName',
      'client.clientCode',
      'client.status',
      'client.logoUrl',
      'client.crmOnBehalfEnabled',
    ]);
    const clients = await qb.getMany();

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

  /**
   * Throws ForbiddenException if the given client is NOT owned (via its
   * assigned CRM) by the supplied CCO user. Used by /api/v1/cco/clients/*
   * to keep CCOs from acting on clients outside their span of control.
   */
  async assertClientOwnedByCco(clientId: string, ccoId: string) {
    const [row] = await this.dataSource.query(
      `SELECT 1
         FROM clients c
         INNER JOIN users u ON u.id = c.assigned_crm_id
        WHERE c.id = $1 AND u.owner_cco_id = $2 AND u.deleted_at IS NULL
        LIMIT 1`,
      [clientId, ccoId],
    );
    if (!row) {
      throw new ForbiddenException(
        'Client is not assigned to a CRM under your span of control',
      );
    }
  }

  /**
   * Throws ForbiddenException if the supplied user (CRM/AUDITOR) is not
   * owned by the given CCO.
   */
  async assertUserOwnedByCco(
    userId: string,
    ccoId: string,
    expectedRoleCode?: string,
  ) {
    const [row] = await this.dataSource.query(
      `SELECT r.code AS role_code
         FROM users u
         INNER JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.owner_cco_id = $2 AND u.deleted_at IS NULL
        LIMIT 1`,
      [userId, ccoId],
    );
    if (!row) {
      throw new ForbiddenException(
        'Target user is not under your span of control',
      );
    }
    if (expectedRoleCode && row.role_code !== expectedRoleCode) {
      throw new ForbiddenException(
        `Target user is not a ${expectedRoleCode}`,
      );
    }
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
      select: [
        'id',
        'clientName',
        'clientCode',
        'status',
        'logoUrl',
        'crmOnBehalfEnabled',
      ],
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

      // ─────────────────────────────────────────────────────────────────
      // 18-MONTH RETENTION SNAPSHOT
      // Capture registers, payroll, audit reports and contractor details
      // (deployment dates, termination dates, NC points) BEFORE the
      // cascade cancels/deactivates the source rows. The snapshot lives
      // in `client_deletion_archive` for 548 days, then is purged by
      // ClientArchivePurgeCronService.
      // ─────────────────────────────────────────────────────────────────
      try {
        await this.snapshotForRetention(m, clientId, client, deletedBy ?? null, reason ?? null);
      } catch (err: any) {
        // Snapshot failure must NOT block the soft-delete itself; just log.
        this.logger.error(
          `Retention snapshot failed for client ${clientId}: ${err?.message || err}`,
        );
      }

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

      // ─────────────────────────────────────────────────────────────────
      // CASCADE: when a client is deleted, every linked operational record
      // (assignments, audits, contractor data, compliance, etc.) must be
      // closed/deactivated so it stops appearing on user task lists,
      // auditor dashboards, CRM queues, and Legitx KPIs.
      //
      // Each statement is wrapped in a try/catch and logs a warning on
      // failure (e.g. table absent on a particular environment) so a
      // single missing migration doesn't roll back the whole soft-delete.
      // ─────────────────────────────────────────────────────────────────
      const safe = async (label: string, sql: string) => {
        try {
          await m.query(sql, [clientId]);
        } catch (err: any) {
          this.logger.warn(
            `softDelete cascade [${label}] failed for client ${clientId}: ${err?.message || err}`,
          );
        }
      };

      // ── AuditXpert: schedules, audits, frequency rules, observations,
      //    NCs, reports, AI observations ─────────────────────────────────
      await safe(
        'audit_schedules',
        `UPDATE audit_schedules
            SET status = 'CANCELLED', updated_at = NOW()
          WHERE client_id = $1
            AND status NOT IN ('COMPLETED', 'SUBMITTED', 'CANCELLED')`,
      );
      await safe(
        'audits',
        `UPDATE audits
            SET status = 'CANCELLED', updated_at = NOW()
          WHERE client_id = $1
            AND status NOT IN ('COMPLETED', 'SUBMITTED', 'CANCELLED', 'CLOSED')`,
      );
      await safe(
        'audit_frequency_rules',
        `UPDATE audit_frequency_rules
            SET is_active = false, updated_at = NOW()
          WHERE client_id = $1
            AND is_active = true`,
      );
      await safe(
        'audit_observations',
        `UPDATE audit_observations o
            SET status = 'CLOSED', updated_at = NOW()
           FROM audits a
          WHERE a.id = o.audit_id
            AND a.client_id = $1
            AND o.status NOT IN ('CLOSED', 'RESOLVED')`,
      );
      await safe(
        'audit_non_compliances',
        `UPDATE audit_non_compliances nc
            SET status = 'CLOSED', updated_at = NOW()
           FROM audits a
          WHERE a.id = nc.audit_id
            AND a.client_id = $1
            AND nc.status NOT IN ('CLOSED', 'RESOLVED', 'CANCELLED')`,
      );
      await safe(
        'audit_reports',
        `UPDATE audit_reports
            SET status = 'CANCELLED', updated_at = NOW()
          WHERE client_id = $1
            AND status NOT IN ('FINAL', 'PUBLISHED', 'CANCELLED')`,
      );
      await safe(
        'ai_audit_observations',
        `UPDATE ai_audit_observations
            SET status = 'CLOSED'
          WHERE client_id = $1
            AND status IS DISTINCT FROM 'CLOSED'`,
      );

      // ── Assignments (CRM ↔ client, auditor ↔ client/branch) ─────────
      await safe(
        'client_assignments',
        `UPDATE client_assignments
            SET status = 'INACTIVE', updated_at = NOW()
          WHERE client_id = $1
            AND status <> 'INACTIVE'`,
      );
      await safe(
        'client_assignments_current',
        `DELETE FROM client_assignments_current WHERE client_id = $1`,
      );
      await safe(
        'branch_auditor_assignments',
        `UPDATE branch_auditor_assignments
            SET is_active = false, updated_at = NOW()
          WHERE client_id = $1
            AND is_active = true`,
      );

      // ── Compliance tasks & documents ────────────────────────────────
      await safe(
        'compliance_tasks',
        `UPDATE compliance_tasks
            SET status = 'CANCELLED', updated_at = NOW()
          WHERE client_id = $1
            AND status NOT IN ('COMPLETED', 'CANCELLED')`,
      );
      await safe(
        'compliance_documents',
        `UPDATE compliance_documents
            SET is_deleted = true, deleted_at = NOW()
          WHERE client_id = $1
            AND is_deleted = false`,
      );
      await safe(
        'compliance_returns',
        `UPDATE compliance_returns
            SET is_deleted = true, deleted_at = NOW()
          WHERE client_id = $1
            AND is_deleted = false`,
      );
      await safe(
        'compliance_doc_library',
        `UPDATE compliance_doc_library
            SET is_deleted = true, deleted_at = NOW()
          WHERE client_id = $1
            AND is_deleted = false`,
      );
      await safe(
        'monthly_compliance_uploads',
        `UPDATE monthly_compliance_uploads
            SET is_deleted = true
          WHERE client_id = $1
            AND is_deleted = false`,
      );
      await safe(
        'crm_unit_documents',
        `UPDATE crm_unit_documents
            SET deleted_at = NOW()
          WHERE client_id = $1
            AND deleted_at IS NULL`,
      );
      await safe(
        'safety_documents',
        `UPDATE safety_documents
            SET is_deleted = true
          WHERE client_id = $1
            AND is_deleted = false`,
      );

      // ── Contractor records linked to this client ────────────────────
      await safe(
        'contractor_employees',
        `UPDATE contractor_employees
            SET is_active = false
          WHERE client_id = $1
            AND is_active = true`,
      );

      // ── Payroll: deactivate the client-payroll assignment so payroll
      //    teams stop seeing this client in their work queues. We leave
      //    historical runs / payslips intact.
      await safe(
        'payroll_client_assignment',
        `UPDATE payroll_client_assignment
            SET status = 'INACTIVE', updated_at = NOW()
          WHERE client_id = $1
            AND status <> 'INACTIVE'`,
      );

      // ── HR masters: deactivate so they don't appear in pickers ──────
      await safe(
        'designations',
        `UPDATE designations
            SET is_active = false
          WHERE client_id = $1
            AND is_active = true`,
      );
      await safe(
        'grades',
        `UPDATE grades
            SET is_active = false
          WHERE client_id = $1
            AND is_active = true`,
      );
      await safe(
        'employees',
        `UPDATE employees
            SET is_active = false
          WHERE client_id = $1
            AND is_active = true`,
      );
      await safe(
        'client_department_contact',
        `UPDATE client_department_contact
            SET is_active = false
          WHERE client_id = $1
            AND is_active = true`,
      );

      // ── SLA tasks ───────────────────────────────────────────────────
      await safe(
        'sla_tasks',
        `UPDATE sla_tasks
            SET deleted_at = NOW()
          WHERE client_id = $1
            AND deleted_at IS NULL`,
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

  /**
   * Snapshot a client's registers, payroll, audit reports and contractor
   * deployment / termination / NC details into `client_deletion_archive`
   * for 18-month retention. Called inside the soft-delete transaction.
   *
   * Each fetch is wrapped in its own try/catch so a missing optional
   * table on a particular environment doesn't abort the snapshot.
   */
  private async snapshotForRetention(
    m: import('typeorm').EntityManager,
    clientId: string,
    client: ClientEntity,
    archivedBy: string | null,
    reason: string | null,
  ): Promise<void> {
    const RETENTION_DAYS = 548; // ≈ 18 months (1.5 years)

    const safeFetch = async <T = any>(
      label: string,
      sql: string,
    ): Promise<T[]> => {
      try {
        return await m.query(sql, [clientId]);
      } catch (err: any) {
        this.logger.warn(
          `Retention snapshot [${label}] failed for client ${clientId}: ${err?.message || err}`,
        );
        return [];
      }
    };

    // ── Registers (statutory registers data) ────────────────────────────
    const registers = await safeFetch(
      'registers_records',
      `SELECT id, register_type, branch_id, period_year, period_month,
              data, created_at, updated_at
         FROM registers_records
        WHERE client_id = $1
        ORDER BY period_year DESC, period_month DESC, created_at DESC`,
    );

    // ── Payroll: runs + per-employee totals (high-level financial trail)─
    const payrollRuns = await safeFetch(
      'payroll_runs',
      `SELECT id, period_year, period_month, status, finalized_at,
              total_gross, total_net, total_employees, created_at
         FROM payroll_runs
        WHERE client_id = $1
        ORDER BY period_year DESC, period_month DESC`,
    );
    const payrollEmployees = await safeFetch(
      'payroll_run_employees',
      `SELECT pre.payroll_run_id, pre.employee_id, pre.gross, pre.net,
              pre.pf_employee, pre.pf_employer, pre.esi_employee,
              pre.esi_employer, pre.tds, pre.lop_days, pre.paid_days
         FROM payroll_run_employees pre
        WHERE pre.client_id = $1`,
    );

    // ── Audit reports (final PDFs / metadata) + NC points ──────────────
    const auditReports = await safeFetch(
      'audit_reports',
      `SELECT ar.id, ar.audit_id, ar.file_name, ar.file_path,
              ar.uploaded_by_user_id, ar.uploaded_at, ar.report_date,
              a.audit_code, a.audit_type, a.period_year, a.period_code,
              a.score, a.status AS audit_status
         FROM audit_reports ar
         JOIN audits a ON a.id = ar.audit_id
        WHERE a.client_id = $1
        ORDER BY ar.uploaded_at DESC`,
    );
    const ncPoints = await safeFetch(
      'audit_non_compliances',
      `SELECT nc.id, nc.audit_id, nc.title, nc.description, nc.severity,
              nc.status, nc.due_date, nc.resolved_at, nc.created_at,
              a.audit_code, a.audit_type, a.period_year, a.period_code
         FROM audit_non_compliances nc
         JOIN audits a ON a.id = nc.audit_id
        WHERE a.client_id = $1
        ORDER BY nc.created_at DESC`,
    );

    // ── Contractors: per-worker deployment / termination + linkage ─────
    const contractorEmployees = await safeFetch(
      'contractor_employees',
      `SELECT ce.id, ce.contractor_user_id, ce.branch_id, ce.name,
              ce.designation, ce.department,
              ce.date_of_joining   AS deployment_date,
              ce.date_of_exit      AS termination_date,
              ce.exit_reason,
              ce.aadhaar, ce.pan, ce.uan, ce.esic,
              ce.is_active, ce.created_at, ce.updated_at,
              u.name AS contractor_user_name,
              u.email AS contractor_user_email
         FROM contractor_employees ce
         LEFT JOIN users u ON u.id = ce.contractor_user_id
        WHERE ce.client_id = $1
        ORDER BY ce.date_of_joining DESC NULLS LAST`,
    );
    const contractorAccounts = await safeFetch(
      'users',
      `SELECT id, name, email, phone, role, is_active, created_at, deleted_at
         FROM users
        WHERE client_id = $1
          AND role = 'CONTRACTOR'`,
    );

    // ── Per-contractor NC summary (count + list of NC titles) ──────────
    const contractorNcSummary = await safeFetch(
      'contractor_nc_summary',
      `SELECT a.contractor_user_id,
              COUNT(nc.id)::int AS nc_count,
              COALESCE(
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'auditCode',  a.audit_code,
                    'title',      nc.title,
                    'severity',   nc.severity,
                    'status',     nc.status,
                    'dueDate',    nc.due_date,
                    'createdAt',  nc.created_at
                  )
                  ORDER BY nc.created_at DESC
                ) FILTER (WHERE nc.id IS NOT NULL),
                '[]'::json
              ) AS nc_points
         FROM audits a
         LEFT JOIN audit_non_compliances nc ON nc.audit_id = a.id
        WHERE a.client_id = $1
          AND a.contractor_user_id IS NOT NULL
        GROUP BY a.contractor_user_id`,
    );

    const contractorsSnapshot = {
      accounts: contractorAccounts,
      employees: contractorEmployees,
      ncSummary: contractorNcSummary,
    };

    const payrollSnapshot = {
      runs: payrollRuns,
      employees: payrollEmployees,
    };

    const auditReportsSnapshot = {
      reports: auditReports,
      nonCompliances: ncPoints,
    };

    const meta = {
      counts: {
        registers: registers.length,
        payrollRuns: payrollRuns.length,
        payrollEmployeeRows: payrollEmployees.length,
        auditReports: auditReports.length,
        nonCompliances: ncPoints.length,
        contractorAccounts: contractorAccounts.length,
        contractorEmployees: contractorEmployees.length,
      },
      retentionDays: RETENTION_DAYS,
      snapshotVersion: 1,
    };

    await m.query(
      `INSERT INTO client_deletion_archive
         (client_id, client_code, client_name,
          archived_by, delete_reason,
          purge_after,
          registers_snapshot, payroll_snapshot,
          audit_reports_snapshot, contractors_snapshot,
          meta)
       VALUES
         ($1, $2, $3,
          $4, $5,
          NOW() + make_interval(days => $6),
          $7::jsonb, $8::jsonb,
          $9::jsonb, $10::jsonb,
          $11::jsonb)`,
      [
        clientId,
        client.clientCode ?? null,
        client.clientName ?? null,
        archivedBy,
        reason,
        RETENTION_DAYS,
        JSON.stringify(registers),
        JSON.stringify(payrollSnapshot),
        JSON.stringify(auditReportsSnapshot),
        JSON.stringify(contractorsSnapshot),
        JSON.stringify(meta),
      ],
    );
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
