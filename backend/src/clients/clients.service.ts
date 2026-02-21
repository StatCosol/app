import {
  BadRequestException,
  Injectable,
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
  // Returns client list with aggregates for controller
  async listWithAggregates() {
    return this.listClients();
  }
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
    console.log('[ClientsService.create] Received DTO:', {
      clientCode: dto.clientCode,
      clientName: dto.clientName,
    });

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
        existing.assignedCrmId = dto.assignedCrmId ?? existing.assignedCrmId ?? null;
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

    const client = this.repo.create({
      clientCode,
      clientName: dto.clientName,
      status: 'ACTIVE',
      isActive: true,
      isDeleted: false,
      assignedCrmId: dto.assignedCrmId ?? null,
      assignedAuditorId: dto.assignedAuditorId ?? null,
    });

    console.log('[ClientsService.create] Created entity:', {
      clientCode: client.clientCode,
      clientName: client.clientName,
    });
    let saved;
    try {
      saved = await this.repo.save(client);
    } catch (err) {
      // Handle duplicate client_code error
      if (
        err.code === '23505' &&
        err.detail &&
        err.detail.includes('client_code')
      ) {
        throw new BadRequestException(
          'Client code already exists. Please use a unique code.',
        );
      }
      throw err;
    }
    console.log('[ClientsService.create] Saved to DB:', {
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
      select: ['id', 'clientName', 'clientCode', 'status'],
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
      .where('branch.deletedat IS NULL')
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
    const client = await this.repo.findOne({ where: { id: clientId, isDeleted: false } });
    if (!client) throw new NotFoundException('Client not found');
    client.logoUrl = logoUrl;
    await this.repo.save(client);
    return { message: 'Logo updated', clientId, logoUrl };
  }

  async findById(id: string, includeDeleted = false) {
    return this.repo.findOne({
      select: ['id', 'clientName', 'clientCode', 'status'],
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
    const client = await this.getOrFail(clientId);

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
