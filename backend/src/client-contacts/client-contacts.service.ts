import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  ClientContactDepartment,
  ClientDepartmentContactEntity,
} from './client-department-contact.entity';
import {
  CreateClientContactDto,
  UpdateClientContactDto,
} from './client-contact.dto';

@Injectable()
export class ClientContactsService {
  constructor(
    @InjectRepository(ClientDepartmentContactEntity)
    private readonly repo: Repository<ClientDepartmentContactEntity>,
  ) {}

  async listForClient(clientId: string) {
    return this.repo.find({
      where: { clientId },
      order: { department: 'ASC', name: 'ASC' },
    });
  }

  async listByDepartment(
    department: ClientContactDepartment,
    clientIds?: string[],
  ) {
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.department = :department', { department })
      .andWhere('c.is_active = TRUE');
    if (clientIds && clientIds.length) {
      qb.andWhere('c.client_id IN (:...ids)', { ids: clientIds });
    }
    return qb.orderBy('c.client_id', 'ASC').addOrderBy('c.email', 'ASC').getMany();
  }

  async getActiveEmails(
    clientId: string,
    department: ClientContactDepartment,
  ): Promise<string[]> {
    const rows = await this.repo.find({
      where: { clientId, department, isActive: true },
      select: ['email'],
    });
    const emails = rows
      .map((r) => (r.email || '').trim())
      .filter((e) => !!e);
    return Array.from(new Set(emails.map((e) => e.toLowerCase())));
  }

  async create(dto: CreateClientContactDto, createdBy?: string) {
    const dup = await this.repo
      .createQueryBuilder('c')
      .where('c.client_id = :clientId', { clientId: dto.clientId })
      .andWhere('c.department = :department', { department: dto.department })
      .andWhere('LOWER(c.email) = LOWER(:email)', { email: dto.email })
      .getOne();
    if (dup) {
      throw new BadRequestException(
        'A contact with this email already exists for this client/department',
      );
    }
    const ent = this.repo.create({
      clientId: dto.clientId,
      department: dto.department,
      name: dto.name.trim(),
      email: dto.email.trim(),
      phone: dto.phone?.trim() || null,
      designation: dto.designation?.trim() || null,
      isActive: dto.isActive ?? true,
      notes: dto.notes?.trim() || null,
      createdBy: createdBy || null,
      updatedBy: createdBy || null,
    });
    return this.repo.save(ent);
  }

  async update(id: string, dto: UpdateClientContactDto, updatedBy?: string) {
    const ent = await this.repo.findOne({ where: { id } });
    if (!ent) throw new NotFoundException('Contact not found');

    // If email/department/client changed, re-check uniqueness
    const newEmail = dto.email ? dto.email.trim() : ent.email;
    const newDept = dto.department ?? ent.department;
    const newClient = dto.clientId ?? ent.clientId;
    if (
      newEmail.toLowerCase() !== ent.email.toLowerCase() ||
      newDept !== ent.department ||
      newClient !== ent.clientId
    ) {
      const dup = await this.repo
        .createQueryBuilder('c')
        .where('c.client_id = :clientId', { clientId: newClient })
        .andWhere('c.department = :department', { department: newDept })
        .andWhere('LOWER(c.email) = LOWER(:email)', { email: newEmail })
        .andWhere('c.id <> :id', { id })
        .getOne();
      if (dup) {
        throw new BadRequestException(
          'Another contact with this email already exists for this client/department',
        );
      }
    }

    Object.assign(ent, {
      clientId: newClient,
      department: newDept,
      email: newEmail,
      name: dto.name?.trim() ?? ent.name,
      phone:
        dto.phone === undefined ? ent.phone : dto.phone?.trim() || null,
      designation:
        dto.designation === undefined
          ? ent.designation
          : dto.designation?.trim() || null,
      isActive: dto.isActive ?? ent.isActive,
      notes: dto.notes === undefined ? ent.notes : dto.notes?.trim() || null,
      updatedBy: updatedBy || ent.updatedBy,
    });
    return this.repo.save(ent);
  }

  async remove(id: string) {
    const ent = await this.repo.findOne({ where: { id } });
    if (!ent) throw new NotFoundException('Contact not found');
    await this.repo.remove(ent);
    return { ok: true };
  }

  async bulkActiveByClients(
    clientIds: string[],
    department: ClientContactDepartment,
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (!clientIds.length) return result;
    const rows = await this.repo.find({
      where: {
        clientId: In(clientIds),
        department,
        isActive: true,
      },
      select: ['clientId', 'email'],
    });
    for (const r of rows) {
      const arr = result.get(r.clientId) || [];
      const e = (r.email || '').trim();
      if (e && !arr.find((x) => x.toLowerCase() === e.toLowerCase())) arr.push(e);
      result.set(r.clientId, arr);
    }
    return result;
  }
}
