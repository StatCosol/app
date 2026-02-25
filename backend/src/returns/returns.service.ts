import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
type UploadedFile = { originalname: string; buffer: Buffer; mimetype: string };
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceReturnEntity, ReturnStatus } from './entities/compliance-return.entity';
import { CreateReturnDto } from './dto/create-return.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';
import { BranchAccessService } from '../auth/branch-access.service';
import { ClientAssignmentCurrentEntity } from '../assignments/entities/client-assignment-current.entity';
import * as fs from 'fs';
import * as path from 'path';

export type ReturnKind = 'ack' | 'challan';

@Injectable()
export class ReturnsService {
  private readonly allowedMimeTypes = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]);

  // Simple due-date catalog by return code; fallback is 20th of next month.
  private readonly dueDayByReturnCode: Record<string, number> = {
    PF: 15,
    ESI: 15,
    PT: 20,
    LWF: 20,
    GST: 11,
    TDS: 7,
    ROC: 30,
  };

  constructor(
    @InjectRepository(ComplianceReturnEntity)
    private readonly returnsRepo: Repository<ComplianceReturnEntity>,
    @InjectRepository(ClientAssignmentCurrentEntity)
    private readonly assignmentsRepo: Repository<ClientAssignmentCurrentEntity>,
    private readonly branchAccess: BranchAccessService,
  ) {}

  // --------- Lookups ----------
  getReturnTypes() {
    // Compact catalog used by UI filters/dropdowns
    return [
      { code: 'PF', label: 'PF Monthly Return', lawType: 'LABOUR' },
      { code: 'ESI', label: 'ESI Monthly Return', lawType: 'LABOUR' },
      { code: 'PT', label: 'Professional Tax', lawType: 'LABOUR' },
      { code: 'LWF', label: 'Labour Welfare Fund', lawType: 'LABOUR' },
      { code: 'GST', label: 'GST Return', lawType: 'TAX' },
      { code: 'TDS', label: 'TDS Return', lawType: 'TAX' },
      { code: 'ROC', label: 'ROC Filings', lawType: 'ROC' },
    ];
  }

  // --------- Client-facing ---------
  async listForClient(user: any, q: any) {
    this.ensureClientContext(user);
    const qb = this.returnsRepo
      .createQueryBuilder('r')
      .where('r.clientId = :clientId', { clientId: user.clientId });

    await this.applyBranchScope(qb, user);
    this.applyFilters(qb, q);

    qb.orderBy('r.dueDate', 'DESC', 'NULLS LAST').addOrderBy('r.createdAt', 'DESC');

    return qb.getMany();
  }

  async createForClient(user: any, dto: CreateReturnDto) {
    this.ensureClientContext(user);
    if (dto.clientId !== user.clientId) {
      throw new ForbiddenException('Cross-tenant create blocked');
    }

    if (!dto.branchId) {
      throw new BadRequestException('branchId is required for client users');
    }

    // Only branch users can create filings
    await this.branchAccess.assertBranchUserOnly(user.userId, dto.branchId);

    const entity = this.returnsRepo.create({
      clientId: user.clientId,
      branchId: dto.branchId,
      lawType: dto.lawType,
      returnType: dto.returnType,
      periodYear: dto.periodYear,
      periodMonth: dto.periodMonth ?? null,
      periodLabel: dto.periodLabel ?? null,
      dueDate: this.resolveDueDate(dto),
      status: 'PENDING',
      filedByUserId: null,
      filedDate: null,
      ackNumber: null,
      ackFilePath: null,
      challanFilePath: null,
    });

    return this.returnsRepo.save(entity);
  }

  async uploadProof(
    user: any,
    id: string,
    kind: ReturnKind,
    file: UploadedFile,
    ackNumber?: string | null,
  ) {
    const rec = await this.findOwned(user, id);

    // Upload permissions:
    // - Branch CLIENT users: only branch users for that branch
    // - CRM users: allowed if they are assigned to the client
    if (!rec.branchId) throw new ForbiddenException('Branch ID missing for filing');

    if (user?.roleCode === 'CRM') {
      const assignment = await this.assignmentsRepo.findOne({
        where: {
          clientId: rec.clientId,
          assignmentType: 'CRM',
          assignedToUserId: user.userId,
        },
      });
      if (!assignment) throw new ForbiddenException('You are not assigned to this client');
    } else {
      // CLIENT branch users
      await this.branchAccess.assertBranchUserOnly(user.userId, rec.branchId);
    }

    if (!file) throw new BadRequestException('File is required');
    if (!this.allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException('File type not allowed');
    }

    const storedPath = this.saveFile(file, kind);

    if (kind === 'ack') {
      rec.ackFilePath = storedPath;
      rec.ackNumber = ackNumber ?? rec.ackNumber;
    } else {
      rec.challanFilePath = storedPath;
    }

    rec.filedByUserId = user.userId;
    rec.status = rec.status === 'PENDING' ? 'IN_PROGRESS' : rec.status;

    return this.returnsRepo.save(rec);
  }

  async submit(user: any, id: string) {
    const rec = await this.findOwned(user, id);
    if (rec.branchId) {
      await this.branchAccess.assertBranchUserOnly(user.userId, rec.branchId);
    }

    rec.status = 'SUBMITTED';
    rec.filedByUserId = user.userId;
    rec.filedDate = rec.filedDate ?? this.today();

    return this.returnsRepo.save(rec);
  }

  // --------- CRM ---------
  async listForCrm(user: any, q: any) {
    const qb = this.returnsRepo
      .createQueryBuilder('r')
      .innerJoin(
        ClientAssignmentCurrentEntity,
        'ac',
        'ac.clientId = r.clientId AND ac.assignmentType = :type AND ac.assignedToUserId = :crmId',
        { type: 'CRM', crmId: user.userId },
      );

    this.applyFilters(qb, q);
    qb.orderBy('r.dueDate', 'DESC', 'NULLS LAST').addOrderBy('r.createdAt', 'DESC');
    return qb.getMany();
  }

  async updateStatusAsCrm(user: any, id: string, dto: UpdateReturnStatusDto) {
    const rec = await this.returnsRepo.findOne({ where: { id, isDeleted: false } });
    if (!rec) throw new NotFoundException('Return not found');

    const assignment = await this.assignmentsRepo.findOne({
      where: {
        clientId: rec.clientId,
        assignmentType: 'CRM',
        assignedToUserId: user.userId,
      },
    });

    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this client');
    }

    rec.status = dto.status;
    if (dto.status === 'APPROVED') {
      rec.filedDate = rec.filedDate ?? this.today();
    }
    return this.returnsRepo.save(rec);
  }

  // --------- Auditor ---------
  async listForAuditor(user: any, q: any) {
    const qb = this.returnsRepo
      .createQueryBuilder('r')
      .innerJoin(
        ClientAssignmentCurrentEntity,
        'ac',
        'ac.clientId = r.clientId AND ac.assignmentType = :type AND ac.assignedToUserId = :auditorId',
        { type: 'AUDITOR', auditorId: user.userId },
      );

    this.applyFilters(qb, q);
    qb.orderBy('r.dueDate', 'DESC', 'NULLS LAST').addOrderBy('r.createdAt', 'DESC');
    return qb.getMany();
  }

  async updateStatusAsAuditor(user: any, id: string, dto: UpdateReturnStatusDto) {
    const rec = await this.returnsRepo.findOne({ where: { id, isDeleted: false } });
    if (!rec) throw new NotFoundException('Return not found');

    const assignment = await this.assignmentsRepo.findOne({
      where: {
        clientId: rec.clientId,
        assignmentType: 'AUDITOR',
        assignedToUserId: user.userId,
      },
    });

    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this client');
    }

    rec.status = dto.status;
    if (dto.status === 'APPROVED') {
      rec.filedDate = rec.filedDate ?? this.today();
    }
    return this.returnsRepo.save(rec);
  }

  // --------- Admin ---------
  async listForAdmin(q: any) {
    const qb = this.returnsRepo.createQueryBuilder('r');
    this.applyFilters(qb, q);
    qb.orderBy('r.dueDate', 'DESC', 'NULLS LAST').addOrderBy('r.createdAt', 'DESC');
    return qb.getMany();
  }

  async updateStatusAsAdmin(id: string, dto: UpdateReturnStatusDto) {
    const rec = await this.returnsRepo.findOne({ where: { id, isDeleted: false } });
    if (!rec) throw new NotFoundException('Return not found');
    rec.status = dto.status;
    if (dto.status === 'APPROVED') {
      rec.filedDate = rec.filedDate ?? this.today();
    }
    return this.returnsRepo.save(rec);
  }

  async softDeleteAsAdmin(id: string, deletedBy: string | null, reason?: string | null) {
    const rec = await this.returnsRepo.findOne({ where: { id, isDeleted: false } });
    if (!rec) throw new NotFoundException('Return not found');

    rec.isDeleted = true;
    rec.deletedAt = new Date();
    rec.deletedBy = deletedBy ?? null;
    rec.deleteReason = reason ?? rec.deleteReason ?? null;

    return this.returnsRepo.save(rec);
  }

  async restoreAsAdmin(id: string) {
    const rec = await this.returnsRepo.findOne({ where: { id, isDeleted: true } });
    if (!rec) throw new NotFoundException('Return not found or not deleted');

    rec.isDeleted = false;
    rec.deletedAt = null;
    rec.deletedBy = null;
    rec.deleteReason = null;

    return this.returnsRepo.save(rec);
  }

  // --------- Helpers ---------
  private ensureClientContext(user: any) {
    if (!user?.clientId) {
      throw new ForbiddenException('Client context missing');
    }
  }

  private async findOwned(user: any, id: string) {
    const rec = await this.returnsRepo.findOne({ where: { id, isDeleted: false } });
    if (!rec) throw new NotFoundException('Return not found');
    // CRM users are verified via assignment check in the caller
    if (user?.roleCode !== 'CRM' && rec.clientId !== user.clientId) {
      throw new ForbiddenException('Cross-tenant access blocked');
    }
    return rec;
  }

  private applyFilters(qb: any, q: any) {
    qb.andWhere('r.isDeleted = false').andWhere('r.deletedAt IS NULL');
    if (!q) return;
    if (q.clientId) qb.andWhere('r.clientId = :clientId', { clientId: q.clientId });
    if (q.branchId) qb.andWhere('r.branchId = :branchId', { branchId: q.branchId });
    if (q.status) qb.andWhere('r.status = :status', { status: q.status as ReturnStatus });
    if (q.periodYear) qb.andWhere('r.periodYear = :py', { py: Number(q.periodYear) });
    if (q.periodMonth) qb.andWhere('r.periodMonth = :pm', { pm: Number(q.periodMonth) });
  }

  private async applyBranchScope(qb: any, user: any) {
    const allowed = await this.branchAccess.getAllowedBranchIds(
      user.userId,
      user.clientId,
    );
    if (allowed !== 'ALL') {
      if (!allowed.length) {
        qb.andWhere('1=0');
      } else {
        qb.andWhere('r.branchId IN (:...branchIds)', { branchIds: allowed });
      }
    }
  }

  private resolveDueDate(dto: CreateReturnDto): string | null {
    if (dto.dueDate) return dto.dueDate;
    if (!dto.periodYear || !dto.periodMonth) return null;
    const upper = (dto.returnType || '').toUpperCase();
    const code = Object.keys(this.dueDayByReturnCode).find((k) => upper.includes(k)) ?? upper;
    const dueDay = this.dueDayByReturnCode[code] ?? 20;
    const nextMonth = dto.periodMonth === 12 ? 1 : dto.periodMonth + 1;
    const nextYear = dto.periodMonth === 12 ? dto.periodYear + 1 : dto.periodYear;
    const d = new Date(Date.UTC(nextYear, nextMonth - 1, dueDay));
    return d.toISOString().substring(0, 10);
  }

  private today(): string {
    return new Date().toISOString().substring(0, 10);
  }

  private saveFile(file: UploadedFile, kind: ReturnKind): string {
    const dir = path.join(process.cwd(), 'uploads', 'returns');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = (file.originalname || 'file')
      .replace(/[^a-zA-Z0-9.\-_]/g, '_')
      .substring(0, 80);
    const filename = `${Date.now()}_${kind}_${safe}`;
    const dest = path.join(dir, filename);
    fs.writeFileSync(dest, file.buffer);
    return `/uploads/returns/${filename}`;
  }
}
