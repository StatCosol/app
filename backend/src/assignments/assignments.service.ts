import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, EntityManager, FindOptionsWhere } from 'typeorm';
import {
  ClientAssignmentCurrentEntity,
  AssignmentType,
} from './entities/client-assignment-current.entity';
import { ClientAssignmentHistoryEntity } from './entities/client-assignment-history.entity';
import { BranchAuditorAssignmentEntity } from './entities/branch-auditor-assignment.entity';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { UsersService } from '../users/users.service';
import { ClientsService } from '../clients/clients.service';
import { ClientEntity } from '../clients/entities/client.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { BranchEntity } from '../branches/entities/branch.entity';

type ChangeInput = {
  clientId: string;
  assignmentType: AssignmentType;
  assignedToUserId: string | null;
  actorUserId: string | null;
  actorRole: string | null;
  changeReason?: string | null;
};

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ClientAssignmentCurrentEntity)
    private readonly currentRepo: Repository<ClientAssignmentCurrentEntity>,
    @InjectRepository(ClientAssignmentHistoryEntity)
    private readonly historyRepo: Repository<ClientAssignmentHistoryEntity>,
    @InjectRepository(BranchAuditorAssignmentEntity)
    private readonly branchAuditorRepo: Repository<BranchAuditorAssignmentEntity>,
    private readonly usersService: UsersService,
    private readonly clientsService: ClientsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  private async assertNotAlreadyAssigned(
    clientId: string,
    assignmentType: AssignmentType,
    newUserId: string,
  ) {
    const existing = await this.currentRepo.findOne({
      where: { clientId, assignmentType },
    });
    if (existing?.assignedToUserId === newUserId) {
      throw new ConflictException(`${assignmentType} already assigned`);
    }
  }

  private async ensureClientSlotIsFree(clientId: string, type: AssignmentType) {
    const existing = await this.currentRepo.findOne({
      where: { clientId, assignmentType: type },
    });
    if (existing?.assignedToUserId) {
      throw new ConflictException(
        `${type} is already assigned for this client`,
      );
    }
  }

  /**
   * Keep the denormalised assigned_crm_id / assigned_auditor_id columns on the
   * clients table in sync so that dashboard queries (which read those columns
   * directly) reflect the latest assignment state.
   */
  private async syncClientAssignmentColumn(
    manager: EntityManager,
    clientId: string,
    assignmentType: AssignmentType,
    userId: string | null,
  ) {
    const ALLOWED_COLS: Record<string, string> = {
      CRM: 'assigned_crm_id',
      AUDITOR: 'assigned_auditor_id',
    };
    const col = ALLOWED_COLS[assignmentType];
    if (!col) return; // unknown type — skip silently
    await manager.query(`UPDATE clients SET "${col}" = $1 WHERE id = $2`, [
      userId,
      clientId,
    ]);
  }

  async getCurrent(clientId: string, assignmentType?: AssignmentType) {
    const where: FindOptionsWhere<ClientAssignmentCurrentEntity> = { clientId };
    if (assignmentType) where.assignmentType = assignmentType;
    return this.currentRepo.find({ where, order: { assignmentType: 'ASC' } });
  }

  async getHistory(clientId: string, assignmentType?: AssignmentType) {
    try {
      const where: FindOptionsWhere<ClientAssignmentHistoryEntity> = { clientId };
      if (assignmentType) where.assignmentType = assignmentType;
      return await this.historyRepo.find({
        where,
        order: { startDate: 'DESC' },
      });
    } catch (_) {
      // Audit log is best-effort; ignore failures
      return [];
    }
  }

  async changeAssignment(input: ChangeInput) {
    // Validate client exists
    await this.clientsService.getOrFail(input.clientId);

    // Validate user role matches assignmentType
    if (input.assignedToUserId) {
      const roleCode = await this.usersService.getUserRoleCode(
        input.assignedToUserId,
      );
      if (input.assignmentType === 'CRM' && roleCode !== 'CRM') {
        throw new BadRequestException(
          `User ${input.assignedToUserId} is not a CRM user`,
        );
      }
      if (input.assignmentType === 'AUDITOR' && roleCode !== 'AUDITOR') {
        throw new BadRequestException(
          `User ${input.assignedToUserId} is not an AUDITOR user`,
        );
      }
    }

    const now = new Date();

    const after = await this.dataSource.transaction(async (manager) => {
      const currentRepo = manager.getRepository(ClientAssignmentCurrentEntity);
      const historyRepo = manager.getRepository(ClientAssignmentHistoryEntity);

      const current = await currentRepo.findOne({
        where: {
          clientId: input.clientId,
          assignmentType: input.assignmentType,
        },
      });

      // No-op if unchanged
      if (current && current.assignedToUserId === input.assignedToUserId) {
        return current;
      }

      // Close any open history rows
      await historyRepo.update(
        {
          clientId: input.clientId,
          assignmentType: input.assignmentType,
          endDate: IsNull(),
        },
        { endDate: now },
      );

      // Insert new history row (audit trail for both assign & unassign)
      const hist = historyRepo.create({
        clientId: input.clientId,
        assignmentType: input.assignmentType,
        assignedToUserId: input.assignedToUserId ?? null,
        startDate: now,
        endDate: input.assignedToUserId ? null : now, // close immediately if unassigning
        changedByUserId: input.actorUserId ?? null,
        changeReason: input.changeReason ?? null,
      });
      await historyRepo.save(hist);

      // If unassigning (null user), remove the current row entirely
      if (!input.assignedToUserId) {
        if (current) {
          await currentRepo.remove(current);
        }
        // Sync denormalised column on clients table
        await this.syncClientAssignmentColumn(
          manager,
          input.clientId,
          input.assignmentType,
          null,
        );
        return {
          clientId: input.clientId,
          assignmentType: input.assignmentType,
          assignedToUserId: null,
        } as unknown as ClientAssignmentCurrentEntity;
      }

      // Upsert current assignment
      const upsert = currentRepo.create({
        clientId: input.clientId,
        assignmentType: input.assignmentType,
        assignedToUserId: input.assignedToUserId ?? null,
        startDate: now,
      });

      await currentRepo
        .createQueryBuilder()
        .insert()
        .into(ClientAssignmentCurrentEntity)
        .values(upsert)
        .orUpdate(
          ['assigned_to_user_id', 'start_date', 'updated_at'],
          ['client_id', 'assignment_type'],
        )
        .execute();

      // Sync denormalised column on clients table
      await this.syncClientAssignmentColumn(
        manager,
        input.clientId,
        input.assignmentType,
        input.assignedToUserId,
      );

      const updated = await currentRepo.findOneOrFail({
        where: {
          clientId: input.clientId,
          assignmentType: input.assignmentType,
        },
      });

      return updated;
    });

    await this.auditLogs.log({
      entityType: 'ASSIGNMENT',
      entityId: input.clientId,
      action: 'ASSIGN',
      performedBy: input.actorUserId ?? null,
      performedRole: input.actorRole ?? null,
      reason: input.changeReason,
      beforeJson: null,
      afterJson: after as unknown as Record<string, unknown>,
    });

    return after;
  }

  // Convenience wrappers for existing controllers
  async createAssignment(
    dto: CreateAssignmentDto,
    createdBy: string,
    performedRole?: string,
  ) {
    // Run changes per role if provided
    if (dto.crmId) {
      await this.assertNotAlreadyAssigned(dto.clientId, 'CRM', dto.crmId);
      await this.ensureClientSlotIsFree(dto.clientId, 'CRM');
      await this.changeAssignment({
        clientId: dto.clientId,
        assignmentType: 'CRM',
        assignedToUserId: dto.crmId,
        actorUserId: createdBy ?? null,
        actorRole: performedRole ?? null,
        changeReason: 'MANUAL_OVERRIDE',
      });
    }
    if (dto.auditorId) {
      await this.assertNotAlreadyAssigned(
        dto.clientId,
        'AUDITOR',
        dto.auditorId,
      );
      await this.ensureClientSlotIsFree(dto.clientId, 'AUDITOR');
      await this.changeAssignment({
        clientId: dto.clientId,
        assignmentType: 'AUDITOR',
        assignedToUserId: dto.auditorId,
        actorUserId: createdBy ?? null,
        actorRole: performedRole ?? null,
        changeReason: 'MANUAL_OVERRIDE',
      });
    }
    return { message: 'Assignment(s) created/updated' };
  }

  async updateAssignment(
    clientId: string,
    dto: CreateAssignmentDto,
    actorUserId: string | null,
    actorRole?: string,
  ) {
    if (dto.crmId !== undefined) {
      await this.changeAssignment({
        clientId,
        assignmentType: 'CRM',
        assignedToUserId: dto.crmId ?? null,
        actorUserId,
        actorRole: actorRole ?? null,
        changeReason: 'UPDATE',
      });
    }

    if (dto.auditorId !== undefined) {
      await this.changeAssignment({
        clientId,
        assignmentType: 'AUDITOR',
        assignedToUserId: dto.auditorId ?? null,
        actorUserId,
        actorRole: actorRole ?? null,
        changeReason: 'UPDATE',
      });
    }

    return { ok: true };
  }

  async update(
    id: string,
    dto: UpdateAssignmentDto,
    updatedBy: string,
    updatedRole?: string,
  ) {
    // Legacy signature retained; delegate to create-style change operations per fields provided
    if (dto.crmId !== undefined && dto.crmId !== null) {
      await this.changeAssignment({
        clientId: id,
        assignmentType: 'CRM',
        assignedToUserId: dto.crmId,
        actorUserId: updatedBy ?? null,
        actorRole: updatedRole ?? null,
        changeReason: 'MANUAL_OVERRIDE',
      });
    }
    if (dto.auditorId !== undefined && dto.auditorId !== null) {
      await this.changeAssignment({
        clientId: id,
        assignmentType: 'AUDITOR',
        assignedToUserId: dto.auditorId,
        actorUserId: updatedBy ?? null,
        actorRole: updatedRole ?? null,
        changeReason: 'MANUAL_OVERRIDE',
      });
    }
    return { message: 'Assignment updated' };
  }

  async getCurrentByClient(clientId: string, assignmentType?: AssignmentType) {
    return this.getCurrent(clientId, assignmentType);
  }

  async getHistoryByClient(clientId: string, assignmentType?: AssignmentType) {
    return this.getHistory(clientId, assignmentType);
  }

  // Legacy admin listings
  async getAllAssignmentsWithDetails() {
    return this.getCurrentAssignmentsGrouped();
  }

  async getCurrentAssignments() {
    return this.getCurrentAssignmentsGrouped();
  }

  async getCurrentAssignmentsGrouped() {
    const rows: Array<{
      client_id: string;
      client_name: string;
      assignment_type: string;
      assigned_to_user_id: string | null;
      user_name: string | null;
      start_date: Date | null;
    }> = await this.dataSource.query(`
      SELECT
        ca.client_id,
        c.client_name,
        ca.assignment_type,
        ca.assigned_to_user_id,
        u.name AS user_name,
        ca.start_date
      FROM client_assignments_current ca
      JOIN clients c ON c.id = ca.client_id
      LEFT JOIN users u ON u.id = ca.assigned_to_user_id
      ORDER BY ca.client_id, ca.assignment_type
    `);

    const map = new Map<
      string,
      {
        clientId: string;
        clientName: string;
        crmId: string | null;
        crmName: string | null;
        auditorId: string | null;
        auditorName: string | null;
        startDate: Date | null;
        status: 'ASSIGNED' | 'PENDING';
      }
    >();

    for (const r of rows) {
      if (!map.has(r.client_id)) {
        map.set(r.client_id, {
          clientId: r.client_id,
          clientName: r.client_name || r.client_id,
          crmId: null,
          crmName: null,
          auditorId: null,
          auditorName: null,
          startDate: r.start_date ?? null,
          status: 'PENDING',
        });
      }

      const rec = map.get(r.client_id)!;

      if (r.start_date && (!rec.startDate || r.start_date < rec.startDate)) {
        rec.startDate = r.start_date;
      }

      if (r.assignment_type === 'CRM') {
        rec.crmId = r.assigned_to_user_id ?? null;
        rec.crmName = r.user_name ?? null;
      }
      if (r.assignment_type === 'AUDITOR') {
        rec.auditorId = r.assigned_to_user_id ?? null;
        rec.auditorName = r.user_name ?? null;
      }

      rec.status = rec.crmId || rec.auditorId ? 'ASSIGNED' : 'PENDING';
    }

    // Filter out fully-unassigned (ghost) rows where both CRM and auditor are null
    return Array.from(map.values()).filter((r) => r.crmId || r.auditorId);
  }

  async getAssignmentHistory(clientId?: string) {
    try {
      const where: FindOptionsWhere<ClientAssignmentHistoryEntity> = {};
      if (clientId) where.clientId = clientId;
      return await this.historyRepo.find({
        where,
        order: { startDate: 'DESC' },
      });
    } catch (_) {
      // Audit log is best-effort; ignore failures
      return [];
    }
  }

  /**
   * Compatibility helper for the Angular Admin UI, which expects
   * a flat list for each assignment type.
   */
  async listAssignmentsByType(assignmentType: AssignmentType) {
    const rows = await this.currentRepo.find({
      where: { assignmentType },
      order: { clientId: 'ASC' },
    });

    // Resolve names best-effort (do not fail the whole API if a row points to a deleted record)
    const out: Array<{
      id: string;
      clientId: string;
      clientName: string | null;
      assignmentType: AssignmentType;
      assignedToUserId: string | null;
      assignedToName: string | null;
      startDate: Date | null;
      endDate: null;
      status: string;
    }> = [];
    for (const r of rows) {
      let client: ClientEntity | null = null;
      let assignedTo: { name: string } | null = null;
      try {
        client = await this.clientsService.getOrFail(r.clientId);
      } catch (_) {
        client = null;
      }
      if (r.assignedToUserId) {
        try {
          assignedTo = await this.usersService.findById(r.assignedToUserId);
        } catch (_) {
          assignedTo = null;
        }
      }

      out.push({
        id: r.id,
        clientId: r.clientId,
        clientName: client?.clientName ?? null,
        assignmentType: r.assignmentType,
        assignedToUserId: r.assignedToUserId ?? null,
        assignedToName: assignedTo?.name ?? null,
        startDate: r.startDate ?? null,
        endDate: null,
        status: 'ACTIVE',
      });
    }
    return out;
  }

  // For CRM/AUDITOR user-facing lists
  async getAssignedClientsForCrm(userId: string) {
    const currents = await this.currentRepo.find({
      where: { assignmentType: 'CRM', assignedToUserId: userId },
    });
    const clients: ClientEntity[] = [];
    for (const c of currents) {
      try {
        const client = await this.clientsService.getOrFail(c.clientId);
        if (client.status === 'ACTIVE' && !client.isDeleted)
          clients.push(client);
      } catch (_) {
        // ignore missing
      }
    }
    return clients;
  }

  async getAssignedClientsForAuditor(userId: string) {
    const currents = await this.currentRepo.find({
      where: { assignmentType: 'AUDITOR', assignedToUserId: userId },
    });

    const branchAssignments = await this.branchAuditorRepo.find({
      where: { auditorUserId: userId, isActive: true },
      select: ['clientId'],
    });

    const clientIds = new Set<string>([
      ...currents.map((c) => String(c.clientId)),
      ...branchAssignments.map((b) => String(b.clientId)),
    ]);

    const clients: ClientEntity[] = [];
    for (const clientId of clientIds) {
      try {
        const client = await this.clientsService.getOrFail(clientId);
        if (client.status === 'ACTIVE' && !client.isDeleted) {
          clients.push(client);
        }
      } catch (_) {
        // ignore missing
      }
    }
    return clients;
  }

  async isClientAssignedToCrm(clientId: string, crmUserId: string) {
    const current = await this.currentRepo.findOne({
      where: {
        clientId,
        assignmentType: 'CRM',
        assignedToUserId: crmUserId,
      },
    });
    return !!current;
  }

  async getActiveAssignmentsForCrm(crmUserId: string) {
    return this.currentRepo.find({
      where: {
        assignmentType: 'CRM',
        assignedToUserId: crmUserId,
      },
    });
  }

  async getActiveAssignmentForClient(clientId: string) {
    return this.currentRepo.findOne({
      where: {
        clientId,
        assignmentType: 'CRM',
      },
    });
  }

  async isClientAssignedToAuditor(clientId: string, auditorUserId: string) {
    const current = await this.currentRepo.findOne({
      where: {
        clientId,
        assignmentType: 'AUDITOR',
        assignedToUserId: auditorUserId,
      },
    });
    return !!current;
  }

  // ---------------------------------------------------------------------------
  // Branch-wise Auditor Assignments (Multiple auditors per client)
  // Rule: One active auditor per branch at a time.
  // ---------------------------------------------------------------------------

  async listBranchAuditorAssignments(filters?: {
    clientId?: string;
    auditorUserId?: string;
    branchId?: string;
    activeOnly?: boolean;
  }) {
    const where: FindOptionsWhere<BranchAuditorAssignmentEntity> = {};
    if (filters?.clientId) where.clientId = filters.clientId;
    if (filters?.auditorUserId) where.auditorUserId = filters.auditorUserId;
    if (filters?.branchId) where.branchId = filters.branchId;
    if (filters?.activeOnly !== false) where.isActive = true;

    const rows = await this.branchAuditorRepo.find({
      where,
      order: { createdAt: 'DESC' },
      relations: ['branch', 'auditorUser'],
    });

    return rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      branchId: r.branchId,
      branchName: r.branch?.branchName ?? null,
      auditorUserId: r.auditorUserId,
      auditorName: r.auditorUser?.name ?? null,
      startDate: r.startDate,
      endDate: r.endDate,
      isActive: r.isActive,
    }));
  }

  async assignAuditorToBranch(input: {
    clientId: string;
    branchId: string;
    auditorUserId: string;
    actorUserId?: string | null;
    actorRole?: string | null;
  }) {
    // Validate user role
    const roleCode = await this.usersService.getUserRoleCode(
      input.auditorUserId,
    );
    if (roleCode !== 'AUDITOR') {
      throw new BadRequestException('auditorUserId must be an AUDITOR user');
    }

    // Validate client exists
    await this.clientsService.getOrFail(input.clientId);

    // Validate branch belongs to client (use BranchEntity mapping to avoid raw alias issues)
    const branch = await this.dataSource
      .getRepository(BranchEntity)
      .findOne({ where: { id: input.branchId }, select: ['id', 'clientId'] });

    if (!branch) throw new BadRequestException('Branch not found');
    if (String(branch.clientId) !== String(input.clientId)) {
      throw new BadRequestException('Branch does not belong to client');
    }

    const now = new Date();

    return this.dataSource.transaction(async (trx) => {
      const repo = trx.getRepository(BranchAuditorAssignmentEntity);

      // End existing active assignment for this branch (if any)
      await repo
        .createQueryBuilder()
        .update(BranchAuditorAssignmentEntity)
        .set({ isActive: false, endDate: now })
        .where('branch_id = :branchId AND is_active = TRUE', {
          branchId: input.branchId,
        })
        .execute();

      // Insert new active assignment
      const created = repo.create({
        clientId: input.clientId,
        branchId: input.branchId,
        auditorUserId: input.auditorUserId,
        startDate: now,
        endDate: null,
        isActive: true,
      });

      const saved = await repo.save(created);

      // Audit log (best effort)
      try {
        await this.auditLogs.log({
          performedBy: input.actorUserId ?? null,
          performedRole: input.actorRole ?? null,
          action: 'ASSIGN',
          entityType: 'BRANCH',
          entityId: input.branchId,
          meta: {
            clientId: input.clientId,
            auditorUserId: input.auditorUserId,
          },
        });
      } catch (_) {
        // Audit log is best-effort; ignore failures
      }

      return { id: saved.id };
    });
  }

  async endBranchAuditorAssignment(
    id: string,
    actor?: { actorUserId?: string | null; actorRole?: string | null },
  ) {
    const row = await this.branchAuditorRepo.findOne({ where: { id } });
    if (!row) throw new BadRequestException('Assignment not found');

    if (!row.isActive) return { id, ended: false };

    const now = new Date();
    row.isActive = false;
    row.endDate = now;
    await this.branchAuditorRepo.save(row);

    try {
      await this.auditLogs.log({
        performedBy: actor?.actorUserId ?? null,
        performedRole: actor?.actorRole ?? null,
        action: 'UNASSIGN',
        entityType: 'BRANCH',
        entityId: row.branchId,
        meta: { assignmentId: id },
      });
    } catch (_) {
      // Audit log is best-effort; ignore failures
    }

    return { id, ended: true };
  }

  async getAssignedBranchesForAuditor(auditorUserId: string) {
    const rows = await this.branchAuditorRepo.find({
      where: { auditorUserId, isActive: true },
      relations: ['branch', 'client'],
      order: { createdAt: 'DESC' },
    });

    return rows.map((r) => ({
      clientId: r.clientId,
      clientName: r.client?.clientName ?? null,
      branchId: r.branchId,
      branchName: r.branch?.branchName ?? null,
    }));
  }
}
