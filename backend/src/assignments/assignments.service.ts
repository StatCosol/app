import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import {
  ClientAssignmentCurrentEntity,
  AssignmentType,
} from './entities/client-assignment-current.entity';
import { ClientAssignmentHistoryEntity } from './entities/client-assignment-history.entity';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { UsersService } from '../users/users.service';
import { ClientsService } from '../clients/clients.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

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

  async getCurrent(clientId: string, assignmentType?: AssignmentType) {
    const where: any = { clientId };
    if (assignmentType) where.assignmentType = assignmentType;
    return this.currentRepo.find({ where, order: { assignmentType: 'ASC' } });
  }

  async getHistory(clientId: string, assignmentType?: AssignmentType) {
    try {
      const where: any = { clientId };
      if (assignmentType) where.assignmentType = assignmentType;
      return await this.historyRepo.find({
        where,
        order: { startDate: 'DESC' },
      });
    } catch (_) {
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

      // Insert new history row
      const hist = historyRepo.create({
        clientId: input.clientId,
        assignmentType: input.assignmentType,
        assignedToUserId: input.assignedToUserId ?? null,
        startDate: now,
        endDate: null,
        changedByUserId: input.actorUserId ?? null,
        changeReason: input.changeReason ?? null,
      });
      await historyRepo.save(hist);

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
        .values(upsert as any)
        .orUpdate(
          ['assigned_to_user_id', 'start_date', 'updated_at'],
          ['client_id', 'assignment_type'],
        )
        .execute();

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
      afterJson: after as any,
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
    const rows = await this.currentRepo.find({
      order: { clientId: 'ASC', assignmentType: 'ASC' },
    });

    const map = new Map<
      string,
      {
        clientId: string;
        crmId: string | null;
        auditorId: string | null;
        startDate: Date | null;
        status: 'ASSIGNED' | 'PENDING';
      }
    >();

    for (const r of rows) {
      if (!map.has(r.clientId)) {
        map.set(r.clientId, {
          clientId: r.clientId,
          crmId: null,
          auditorId: null,
          startDate: r.startDate ?? null,
          status: 'PENDING',
        });
      }

      const rec = map.get(r.clientId)!;

      if (r.startDate && (!rec.startDate || r.startDate < rec.startDate)) {
        rec.startDate = r.startDate;
      }

      if (r.assignmentType === 'CRM') rec.crmId = r.assignedToUserId ?? null;
      if (r.assignmentType === 'AUDITOR')
        rec.auditorId = r.assignedToUserId ?? null;

      rec.status = rec.crmId || rec.auditorId ? 'ASSIGNED' : 'PENDING';
    }

    return Array.from(map.values());
  }

  async getAssignmentHistory(clientId?: string) {
    try {
      const where: any = {};
      if (clientId) where.clientId = clientId;
      return await this.historyRepo.find({
        where,
        order: { startDate: 'DESC' },
      });
    } catch (_) {
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
    const out: any[] = [];
    for (const r of rows) {
      let client: any = null;
      let assignedTo: any = null;
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
        clientName: client?.clientName ?? client?.name ?? null,
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
    const clients: any[] = [];
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
    const clients: any[] = [];
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
}
