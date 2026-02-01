import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientEntity } from './entities/client.entity';
import { ClientUserEntity } from './entities/client-user.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UsersService } from '../users/users.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

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
  ) {}

  async create(dto: CreateClientDto, createdBy?: string, createdRole?: string) {
    console.log('[ClientsService.create] Received DTO:', { clientCode: dto.clientCode, clientName: dto.clientName });

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
      clientCode: dto.clientCode,
      clientName: dto.clientName,
      status: 'ACTIVE',
      isActive: true,
      isDeleted: false,
      assignedCrmId: dto.assignedCrmId ?? null,
      assignedAuditorId: dto.assignedAuditorId ?? null,
    });

    console.log('[ClientsService.create] Created entity:', { clientCode: client.clientCode, clientName: client.clientName });
    let saved;
    try {
      saved = await this.repo.save(client);
    } catch (err) {
      // Handle duplicate client_code error
      if (err.code === '23505' && err.detail && err.detail.includes('client_code')) {
        throw new BadRequestException('Client code already exists. Please use a unique code.');
      }
      throw err;
    }
    console.log('[ClientsService.create] Saved to DB:', { clientCode: saved.clientCode, clientName: saved.clientName });
    await this.auditLogs.log({
      entityType: 'CLIENT',
      entityId: saved.id,
      action: 'CREATE',
      performedBy: createdBy ?? null,
      performedRole: createdRole ?? null,
      afterJson: saved as any,
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
    aggResults.forEach(row => {
      aggMap.set(row.clientId, {
        branchesCount: Number(row.branchesCount),
        totalEmployees: Number(row.totalEmployees),
        contractorsCount: Number(row.contractorsCount),
      });
    });

    // Attach aggregation to client list
    return clients.map(client => ({
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
    const client = await this.getOrFail(clientId);
    client.isDeleted = true;
    client.isActive = false;
    client.status = 'INACTIVE';
    client.deletedAt = new Date();
    client.deletedBy = deletedBy ?? null;
    client.deleteReason = reason ?? null;
    await this.repo.save(client);

    await this.auditLogs.log({
      entityType: 'CLIENT',
      entityId: client.id,
      action: 'SOFT_DELETE',
      performedBy: deletedBy ?? null,
      performedRole: deletedRole ?? null,
      reason: reason ?? null,
      afterJson: {
        isDeleted: client.isDeleted,
        deletedAt: client.deletedAt,
        deletedBy: client.deletedBy,
        deleteReason: client.deleteReason,
      },
    });
    return { id: client.id, message: 'Client soft-deleted' };
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
