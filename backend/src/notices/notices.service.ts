import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NoticeEntity, NoticeStatus } from './entities/notice.entity';
import { NoticeDocumentEntity } from './entities/notice-document.entity';
import { NoticeActivityLogEntity } from './entities/notice-activity-log.entity';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';
import { NoticeQueryDto } from './dto/notice-query.dto';

export interface ReqUser {
  userId: string;
  roleCode: string;
  clientId?: string;
  branchId?: string;
}

@Injectable()
export class NoticesService {
  constructor(
    @InjectRepository(NoticeEntity)
    private readonly repo: Repository<NoticeEntity>,
    @InjectRepository(NoticeDocumentEntity)
    private readonly docRepo: Repository<NoticeDocumentEntity>,
    @InjectRepository(NoticeActivityLogEntity)
    private readonly logRepo: Repository<NoticeActivityLogEntity>,
  ) {}

  /** Generate a notice code: NTC-YYYY-NNN */
  private async generateNoticeCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `NTC-${year}-`;
    const latest = await this.repo
      .createQueryBuilder('n')
      .select('n.noticeCode', 'noticeCode')
      .where('n.noticeCode LIKE :p', { p: `${prefix}%` })
      .orderBy('n.noticeCode', 'DESC')
      .limit(1)
      .getRawOne<{ noticeCode: string }>();

    let seq = 1;
    if (latest?.noticeCode) {
      const num = parseInt(latest.noticeCode.replace(prefix, ''), 10);
      if (!isNaN(num)) seq = num + 1;
    }
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }

  /** Log an activity on a notice */
  private async logActivity(
    noticeId: string,
    action: string,
    user: ReqUser,
    fromStatus?: string | null,
    toStatus?: string | null,
    remarks?: string | null,
  ) {
    await this.logRepo.save({
      noticeId,
      action,
      fromStatus: fromStatus ?? null,
      toStatus: toStatus ?? null,
      remarks: remarks ?? null,
      actionByUserId: user.userId,
      actionRole: user.roleCode,
    });
  }

  /** Create a new notice (CRM / Admin) */
  async create(user: ReqUser, dto: CreateNoticeDto): Promise<NoticeEntity> {
    const noticeCode = await this.generateNoticeCode();
    const notice = this.repo.create({
      noticeCode,
      clientId: dto.clientId,
      branchId: dto.branchId ?? null,
      noticeType: (dto.noticeType as any) ?? 'GENERAL',
      departmentName: dto.departmentName,
      referenceNo: dto.referenceNo ?? null,
      subject: dto.subject,
      description: dto.description ?? null,
      noticeDate: dto.noticeDate,
      receivedDate: dto.receivedDate,
      responseDueDate: dto.responseDueDate ?? null,
      severity: (dto.severity as any) ?? 'MEDIUM',
      status: 'RECEIVED',
      assignedToUserId: dto.assignedToUserId ?? null,
      createdByUserId: user.userId,
    });
    const saved = await this.repo.save(notice);
    await this.logActivity(saved.id, 'CREATED', user, null, 'RECEIVED');
    return saved;
  }

  /** List notices with filters */
  async list(user: ReqUser, query: NoticeQueryDto) {
    const qb = this.repo
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.client', 'client')
      .leftJoinAndSelect('n.branch', 'branch')
      .leftJoinAndSelect('n.assignedTo', 'assignedTo')
      .orderBy('n.createdAt', 'DESC');

    // Scope by role
    if (user.roleCode === 'CLIENT' && user.clientId) {
      qb.andWhere('n.clientId = :cid', { cid: user.clientId });
    }
    if (user.roleCode === 'BRANCH' && user.branchId) {
      qb.andWhere('n.branchId = :bid', { bid: user.branchId });
    }

    // Filters
    if (query.clientId)
      qb.andWhere('n.clientId = :clientId', { clientId: query.clientId });
    if (query.branchId)
      qb.andWhere('n.branchId = :branchId', { branchId: query.branchId });
    if (query.status)
      qb.andWhere('n.status = :status', { status: query.status });
    if (query.severity)
      qb.andWhere('n.severity = :severity', { severity: query.severity });
    if (query.noticeType)
      qb.andWhere('n.noticeType = :noticeType', {
        noticeType: query.noticeType,
      });
    if (query.search) {
      qb.andWhere(
        '(n.subject ILIKE :s OR n.referenceNo ILIKE :s OR n.departmentName ILIKE :s OR n.noticeCode ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    return qb.getMany();
  }

  /** Get a single notice with documents and activity log */
  async getOne(user: ReqUser, id: string) {
    const notice = await this.repo.findOne({
      where: { id },
      relations: ['client', 'branch', 'assignedTo', 'createdBy', 'closedBy'],
    });
    if (!notice) throw new NotFoundException('Notice not found');

    // Role-based scope check
    if (
      user.roleCode === 'CLIENT' &&
      user.clientId &&
      notice.clientId !== user.clientId
    ) {
      throw new ForbiddenException();
    }
    if (
      user.roleCode === 'BRANCH' &&
      user.branchId &&
      notice.branchId !== user.branchId
    ) {
      throw new ForbiddenException();
    }

    const documents = await this.docRepo.find({
      where: { noticeId: id },
      relations: ['uploadedBy'],
      order: { uploadedAt: 'DESC' },
    });

    const activityLog = await this.logRepo.find({
      where: { noticeId: id },
      relations: ['actionBy'],
      order: { createdAt: 'DESC' },
    });

    return { ...notice, documents, activityLog };
  }

  /** Update notice fields + status transitions */
  async update(
    user: ReqUser,
    id: string,
    dto: UpdateNoticeDto,
  ): Promise<NoticeEntity> {
    const notice = await this.repo.findOneBy({ id });
    if (!notice) throw new NotFoundException('Notice not found');

    const oldStatus = notice.status;

    if (dto.noticeType !== undefined) notice.noticeType = dto.noticeType as any;
    if (dto.departmentName !== undefined)
      notice.departmentName = dto.departmentName;
    if (dto.referenceNo !== undefined) notice.referenceNo = dto.referenceNo;
    if (dto.subject !== undefined) notice.subject = dto.subject;
    if (dto.description !== undefined) notice.description = dto.description;
    if (dto.responseDueDate !== undefined)
      notice.responseDueDate = dto.responseDueDate;
    if (dto.severity !== undefined) notice.severity = dto.severity as any;
    if (dto.assignedToUserId !== undefined)
      notice.assignedToUserId = dto.assignedToUserId;
    if (dto.responseSummary !== undefined)
      notice.responseSummary = dto.responseSummary;
    if (dto.responseDate !== undefined) notice.responseDate = dto.responseDate;

    if (dto.status && dto.status !== oldStatus) {
      notice.status = dto.status as NoticeStatus;
      if (dto.status === 'CLOSED') {
        notice.closedAt = new Date();
        notice.closedByUserId = user.userId;
        notice.closureRemarks = dto.closureRemarks ?? null;
      }
      await this.logActivity(
        id,
        'STATUS_CHANGE',
        user,
        oldStatus,
        dto.status,
        dto.remarks,
      );
    }

    return this.repo.save(notice);
  }

  /** Upload a document to a notice */
  async uploadDocument(
    user: ReqUser,
    noticeId: string,
    documentType: string,
    fileName: string,
    fileUrl: string,
    remarks?: string,
  ) {
    const notice = await this.repo.findOneBy({ id: noticeId });
    if (!notice) throw new NotFoundException('Notice not found');

    const doc = this.docRepo.create({
      noticeId,
      documentType: documentType as any,
      fileName,
      fileUrl,
      remarks: remarks ?? null,
      uploadedByUserId: user.userId,
    });
    const saved = await this.docRepo.save(doc);
    await this.logActivity(
      noticeId,
      'DOCUMENT_UPLOADED',
      user,
      null,
      null,
      `Uploaded: ${fileName}`,
    );
    return saved;
  }

  /** KPI summary for dashboard */
  async getKpis(user: ReqUser, clientId?: string) {
    const qb = this.repo.createQueryBuilder('n');

    if (user.roleCode === 'CLIENT' && user.clientId) {
      qb.andWhere('n.clientId = :cid', { cid: user.clientId });
    } else if (clientId) {
      qb.andWhere('n.clientId = :cid', { cid: clientId });
    }
    if (user.roleCode === 'BRANCH' && user.branchId) {
      qb.andWhere('n.branchId = :bid', { bid: user.branchId });
    }

    const all = await qb.getMany();
    const now = new Date().toISOString().slice(0, 10);

    return {
      total: all.length,
      received: all.filter((n) => n.status === 'RECEIVED').length,
      underReview: all.filter((n) => n.status === 'UNDER_REVIEW').length,
      actionRequired: all.filter((n) => n.status === 'ACTION_REQUIRED').length,
      responseDrafted: all.filter((n) => n.status === 'RESPONSE_DRAFTED')
        .length,
      responseSubmitted: all.filter((n) => n.status === 'RESPONSE_SUBMITTED')
        .length,
      closed: all.filter((n) => n.status === 'CLOSED').length,
      escalated: all.filter((n) => n.status === 'ESCALATED').length,
      overdue: all.filter(
        (n) =>
          n.responseDueDate && n.responseDueDate < now && n.status !== 'CLOSED',
      ).length,
      critical: all.filter(
        (n) => n.severity === 'CRITICAL' && n.status !== 'CLOSED',
      ).length,
    };
  }
}
