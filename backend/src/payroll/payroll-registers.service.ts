import * as fs from 'fs';
import archiver from 'archiver';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { AuditEntity } from '../audits/entities/audit.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import { AuditType } from '../common/enums';
import { ClientUploadRegisterRecordDto } from './dto/client-payroll-input.dto';
import { PayrollClientAssignmentEntity } from './entities/payroll-client-assignment.entity';
import { PayrollClientSettings } from './entities/payroll-client-settings.entity';
import { RegistersRecordEntity } from './entities/registers-record.entity';
import { PayrollClientScopeService } from './payroll-client-scope.service';

@Injectable()
export class PayrollRegistersService {
  constructor(
    @InjectRepository(RegistersRecordEntity)
    private readonly rrRepo: Repository<RegistersRecordEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(PayrollClientAssignmentEntity)
    private readonly assignRepo: Repository<PayrollClientAssignmentEntity>,
    @InjectRepository(AuditEntity)
    private readonly auditRepo: Repository<AuditEntity>,
    @InjectRepository(PayrollClientSettings)
    private readonly clientSettingsRepo: Repository<PayrollClientSettings>,
    private readonly scope: PayrollClientScopeService,
  ) {}

  private ensureClientOrBranchUser(user: ReqUser) {
    const isClient =
      !!user?.id && user?.roleCode === 'CLIENT' && !!user?.clientId;
    if (!isClient) {
      throw new BadRequestException(
        'Only client users can access this resource',
      );
    }
  }

  private async ensureClientPayrollAccess(user: ReqUser) {
    this.ensureClientOrBranchUser(user);
    if (user.userType === 'BRANCH') {
      const toggles = await this.getClientAccessToggles(user.clientId!);
      if (!toggles.allowBranchPayrollAccess) {
        throw new ForbiddenException(
          'Payroll access has not been enabled for branch users',
        );
      }
    }
  }

  private async getClientAccessToggles(clientId: string): Promise<{
    allowBranchPayrollAccess: boolean;
    allowBranchWageRegisters: boolean;
    allowBranchSalaryRegisters: boolean;
    payrollBranchScope: 'ALL' | 'SELECTED';
    payrollAllowedBranchIds: string[];
  }> {
    const row = await this.clientSettingsRepo.findOne({ where: { clientId } });
    const s = row?.settings || {};
    return {
      allowBranchPayrollAccess: s.allowBranchPayrollAccess === true,
      allowBranchWageRegisters: s.allowBranchWageRegisters === true,
      allowBranchSalaryRegisters: s.allowBranchSalaryRegisters === true,
      payrollBranchScope:
        s.payrollBranchScope === 'SELECTED' ? 'SELECTED' : 'ALL',
      payrollAllowedBranchIds: Array.isArray(s.payrollAllowedBranchIds)
        ? s.payrollAllowedBranchIds
        : [],
    };
  }

  async clientListRegistersRecords(user: ReqUser, q: Record<string, any>) {
    const qb = await this.buildClientRegistersQuery(user, q);
    const rows = await qb.getMany();
    return rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      branchId: r.branchId ?? null,
      payrollInputId: r.payrollInputId ?? null,
      category: r.category,
      title: r.title,
      registerType: r.registerType ?? null,
      stateCode: r.stateCode ?? null,
      periodYear: r.periodYear ?? null,
      periodMonth: r.periodMonth ?? null,
      fileName: r.fileName ?? null,
      fileType: r.fileType ?? null,
      fileSize: r.fileSize ?? null,
      approvalStatus: r.approvalStatus,
      approvedAt: r.approvedAt ?? null,
      createdAt: r.createdAt,
      preparedByUserId: r.preparedByUserId ?? null,
      downloadUrl: `/api/client/payroll/registers-records/${r.id}/download`,
    }));
  }

  async streamClientRegistersPack(
    user: ReqUser,
    q: Record<string, any>,
    res: Response,
  ) {
    const qb = await this.buildClientRegistersQuery(user, q);
    const maxRows = Math.min(300, Math.max(1, Number(q?.limit) || 120));
    const rows = await qb.limit(maxRows).getMany();
    if (!rows.length) {
      throw new BadRequestException('No registers found for selected filters');
    }

    const available = rows.filter(
      (r) => r.filePath && fs.existsSync(r.filePath),
    );
    if (!available.length) {
      throw new BadRequestException('No register files available for download');
    }

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="registers_pack_${stamp}.zip"`,
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      throw err;
    });
    archive.pipe(res);

    const used = new Set<string>();
    for (const row of available) {
      const period = `${row.periodYear || 'na'}-${row.periodMonth ? String(row.periodMonth).padStart(2, '0') : 'na'}`;
      const source = row.payrollInputId ? 'generated' : 'manual';
      const rawName = `${period}_${source}_${row.title || 'register'}_${row.fileName || row.id}`;
      const zipName = this.uniqueZipFileName(rawName, used);
      archive.file(row.filePath, { name: zipName });
    }

    await archive.finalize();
  }

  private async buildClientRegistersQuery(
    user: ReqUser,
    q: Record<string, any>,
  ) {
    this.ensureClientOrBranchUser(user);
    const qb = this.rrRepo
      .createQueryBuilder('r')
      .where('r.client_id = :cid', { cid: user.clientId })
      .orderBy('r.created_at', 'DESC');

    if (user.userType === 'BRANCH') {
      const toggles = await this.getClientAccessToggles(user.clientId!);
      if (!toggles.allowBranchPayrollAccess) {
        throw new ForbiddenException(
          'Payroll access has not been enabled for branch users',
        );
      }
      if (user.branchIds?.[0]) {
        qb.andWhere('r.branch_id = :ub', { ub: user.branchIds[0] });
      }
      qb.andWhere('r.approval_status = :approved', { approved: 'APPROVED' });
      if (!toggles.allowBranchWageRegisters) {
        qb.andWhere(
          `NOT (LOWER(r.title) LIKE '%wage%' OR LOWER(COALESCE(r.register_type,'')) LIKE '%wage%')`,
        );
      }
      if (!toggles.allowBranchSalaryRegisters) {
        qb.andWhere(
          `NOT (LOWER(r.title) LIKE '%salary%' OR LOWER(COALESCE(r.register_type,'')) LIKE '%salary%')`,
        );
      }
    }

    if (q?.branchId) qb.andWhere('r.branch_id = :b', { b: q.branchId });
    if (q?.category) qb.andWhere('r.category = :cat', { cat: q.category });
    if (q?.periodYear)
      qb.andWhere('r.period_year = :y', { y: Number(q.periodYear) });
    if (q?.periodMonth)
      qb.andWhere('r.period_month = :m', { m: Number(q.periodMonth) });
    if (q?.sourceType === 'GENERATED') {
      qb.andWhere('r.payroll_input_id IS NOT NULL');
    } else if (q?.sourceType === 'MANUAL') {
      qb.andWhere('r.payroll_input_id IS NULL');
    }

    const search = String(q?.search || '').trim();
    if (search) {
      qb.andWhere(
        `(r.title ILIKE :s
          OR COALESCE(r.register_type,'') ILIKE :s
          OR COALESCE(r.file_name,'') ILIKE :s
          OR COALESCE(r.state_code,'') ILIKE :s
          OR COALESCE(r.branch_id::text,'') ILIKE :s)`,
        { s: `%${search}%` },
      );
    }

    return qb;
  }

  private sanitizeZipName(value: string): string {
    const out = String(value || '')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    return out ? out.slice(0, 140) : 'register';
  }

  private uniqueZipFileName(rawName: string, used: Set<string>): string {
    const safe = this.sanitizeZipName(rawName);
    const dot = safe.lastIndexOf('.');
    const stem = dot > 0 ? safe.slice(0, dot) : safe;
    const ext = dot > 0 ? safe.slice(dot) : '';
    let name = safe;
    let idx = 2;
    while (used.has(name.toLowerCase())) {
      name = `${stem}_${idx}${ext}`;
      idx += 1;
    }
    used.add(name.toLowerCase());
    return name;
  }

  async clientUploadRegisterRecord(
    user: ReqUser,
    dto: ClientUploadRegisterRecordDto,
    file: Express.Multer.File,
  ) {
    await this.ensureClientPayrollAccess(user);
    if (!file) throw new BadRequestException('File is required');
    if (!dto?.category || !dto?.title) {
      throw new BadRequestException('category and title are required');
    }
    const row = this.rrRepo.create({
      clientId: user.clientId!,
      branchId: dto.branchId ?? null,
      payrollInputId: dto.payrollInputId ?? null,
      category: dto.category,
      title: dto.title,
      periodYear: dto.periodYear ?? null,
      periodMonth: dto.periodMonth ?? null,
      preparedByUserId: user.id,
      fileName: file.originalname,
      filePath: file.path,
      fileType: file.mimetype,
      fileSize: String(file.size),
    });
    return this.rrRepo.save(row);
  }

  async payrollUploadRegisterRecord(
    user: ReqUser,
    dto: any,
    file: Express.Multer.File,
  ) {
    if (!user?.id && !user?.userId)
      throw new BadRequestException('Invalid user');
    if (!['PAYROLL', 'ADMIN', 'CRM'].includes(user.roleCode)) {
      throw new ForbiddenException('Only payroll/admin/CRM allowed');
    }
    if (!file) throw new BadRequestException('File is required');
    if (!dto?.clientId) throw new BadRequestException('clientId is required');
    if (!dto?.title) throw new BadRequestException('title is required');
    const row = this.rrRepo.create({
      clientId: dto.clientId,
      branchId: dto.branchId ?? null,
      category: dto.category || 'RECORD',
      title: dto.title,
      registerType: dto.registerType ?? null,
      periodYear: dto.periodYear ? Number(dto.periodYear) : null,
      periodMonth: dto.periodMonth ? Number(dto.periodMonth) : null,
      preparedByUserId: user.userId || user.id,
      fileName: file.originalname,
      filePath: file.path,
      fileType: file.mimetype,
      fileSize: String(file.size),
      approvalStatus: 'PENDING',
    });
    return this.rrRepo.save(row);
  }

  async payrollListRegistersRecords(user: ReqUser, q: Record<string, any>) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (!['PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO'].includes(user.roleCode)) {
      throw new ForbiddenException('Only payroll/admin/CRM/CEO/CCO allowed');
    }
    let ids: string[] = [];

    if (['ADMIN', 'CRM', 'CEO', 'CCO'].includes(user.roleCode)) {
      if (q?.clientId) {
        ids = [q.clientId];
      } else {
        const rows = await this.clientRepo
          .createQueryBuilder('c')
          .select('c.id', 'id')
          .where('c.is_deleted = false')
          .getRawMany<{ id: string }>();
        ids = rows.map((r) => r.id);
      }
    } else {
      const assignedClientIds = await this.assignRepo
        .createQueryBuilder('a')
        .select('a.client_id', 'clientId')
        .where('a.payroll_user_id = :uid', { uid: user.id })
        .andWhere('a.status = :s', { s: 'ACTIVE' })
        .andWhere('a.end_date IS NULL')
        .getRawMany<{ clientId: string }>();

      ids = assignedClientIds.map((r) => r.clientId);
      if (ids.length === 0) return [];

      if (q?.clientId) {
        if (!ids.includes(q.clientId)) {
          throw new ForbiddenException('Not assigned to this client');
        }
        ids = [q.clientId];
      }
    }

    return { ids, q };
  }

  private buildPayrollRegistersQb(ids: string[], q: Record<string, any>) {
    const qb = this.rrRepo
      .createQueryBuilder('r')
      .where('r.client_id IN (:...ids)', { ids });

    if (q?.clientId) qb.andWhere('r.client_id = :c', { c: q.clientId });
    if (q?.branchId) qb.andWhere('r.branch_id = :b', { b: q.branchId });
    if (q?.category) qb.andWhere('r.category = :cat', { cat: q.category });
    if (q?.periodYear)
      qb.andWhere('r.period_year = :y', { y: Number(q.periodYear) });
    if (q?.periodMonth)
      qb.andWhere('r.period_month = :m', { m: Number(q.periodMonth) });
    if (q?.registerType)
      qb.andWhere('r.register_type = :rt', { rt: q.registerType });

    qb.orderBy('r.created_at', 'DESC');
    return qb;
  }

  async streamPayrollRegistersPack(
    user: ReqUser,
    q: Record<string, any>,
    res: Response,
  ) {
    const scope = await this.payrollListRegistersRecords(user, q);
    if (Array.isArray(scope)) {
      throw new BadRequestException('No registers found for selected filters');
    }
    const { ids } = scope;
    const qb = this.buildPayrollRegistersQb(ids, q);
    const rows = await qb.limit(300).getMany();
    if (!rows.length) {
      throw new BadRequestException('No registers found for selected filters');
    }

    const available = rows.filter(
      (r) => r.filePath && fs.existsSync(r.filePath),
    );
    if (!available.length) {
      throw new BadRequestException('No register files available for download');
    }

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="registers_pack_${stamp}.zip"`,
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      throw err;
    });
    archive.pipe(res);

    const used = new Set<string>();
    for (const row of available) {
      const period = `${row.periodYear || 'na'}-${row.periodMonth ? String(row.periodMonth).padStart(2, '0') : 'na'}`;
      const rawName = `${period}_${row.registerType || row.category || 'register'}_${row.fileName || row.id}`;
      const zipName = this.uniqueZipFileName(rawName, used);
      archive.file(row.filePath, { name: zipName });
    }

    await archive.finalize();
  }

  async payrollListRegistersFormatted(user: ReqUser, q: Record<string, any>) {
    const scope = await this.payrollListRegistersRecords(user, q);
    if (Array.isArray(scope)) return scope;
    const { ids } = scope;
    const qb = this.buildPayrollRegistersQb(ids, q);
    const rows = await qb.getMany();
    return rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      branchId: r.branchId ?? null,
      payrollInputId: r.payrollInputId ?? null,
      category: r.category,
      title: r.title,
      registerType: r.registerType ?? null,
      stateCode: r.stateCode ?? null,
      periodYear: r.periodYear ?? null,
      periodMonth: r.periodMonth ?? null,
      fileName: r.fileName ?? null,
      fileType: r.fileType ?? null,
      fileSize: r.fileSize ?? null,
      approvalStatus: r.approvalStatus,
      approvedAt: r.approvedAt ?? null,
      createdAt: r.createdAt,
      preparedByUserId: r.preparedByUserId ?? null,
      downloadUrl: `/api/payroll/registers-records/${r.id}/download`,
    }));
  }

  async downloadRegisterForPayroll(user: ReqUser, registerId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    const row = await this.rrRepo.findOne({ where: { id: registerId } });
    if (!row) throw new BadRequestException('Register not found');
    await this.scope.assertPayrollAccessToClient(user, row.clientId, {
      allowReadOnly: true,
    });
    const buffer = fs.readFileSync(row.filePath);
    return { fileName: row.fileName, fileType: row.fileType, buffer };
  }

  /**
   * Download a register/record file for CLIENT.
   * Only approved registers can be downloaded by clients.
   */
  async downloadRegisterForClient(user: ReqUser, registerId: string) {
    this.ensureClientOrBranchUser(user);

    // Enforce top-level payroll access toggle for branch users
    if (user.userType === 'BRANCH') {
      const branchToggles = await this.getClientAccessToggles(user.clientId!);
      if (!branchToggles.allowBranchPayrollAccess) {
        throw new ForbiddenException(
          'Payroll access has not been enabled for branch users',
        );
      }
    }

    const row = await this.rrRepo.findOne({ where: { id: registerId } });
    if (!row) throw new BadRequestException('Register not found');
    if (row.clientId !== user.clientId)
      throw new ForbiddenException('Access denied');
    // Branch users: approved only + same branch
    if (user.userType === 'BRANCH') {
      if (
        user.branchIds?.[0] &&
        row.branchId &&
        row.branchId !== user.branchIds[0]
      ) {
        throw new ForbiddenException('Not your branch register');
      }
      if (row.approvalStatus !== 'APPROVED') {
        throw new ForbiddenException(
          'Register is not yet approved for download',
        );
      }

      // Enforce wage/salary register download restrictions
      const toggles = await this.getClientAccessToggles(user.clientId);

      const title = String(row.title || '').toLowerCase();
      const rtype = String(row.registerType || '').toLowerCase();

      if (
        !toggles.allowBranchWageRegisters &&
        (title.includes('wage') || rtype.includes('wage'))
      ) {
        throw new ForbiddenException(
          'Wage registers are restricted for branch users',
        );
      }
      if (
        !toggles.allowBranchSalaryRegisters &&
        (title.includes('salary') || rtype.includes('salary'))
      ) {
        throw new ForbiddenException(
          'Salary registers are restricted for branch users',
        );
      }
    }
    // Master users can download any status
    const buffer = fs.readFileSync(row.filePath);
    return { fileName: row.fileName, fileType: row.fileType, buffer };
  }

  // ── Register Approval ──────────────────────────────────

  /**
   * Approve a register. PAYROLL or ADMIN only.
   */
  async approveRegister(user: ReqUser, registerId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'PAYROLL' && user.roleCode !== 'ADMIN') {
      throw new ForbiddenException(
        'Only payroll or admin users can approve registers',
      );
    }
    const row = await this.rrRepo.findOne({ where: { id: registerId } });
    if (!row) throw new BadRequestException('Register not found');
    await this.scope.assertPayrollAccessToClient(user, row.clientId);

    row.approvalStatus = 'APPROVED';
    row.approvedByUserId = user.id;
    row.approvedAt = new Date();
    await this.rrRepo.save(row);
    return {
      id: row.id,
      approvalStatus: row.approvalStatus,
      approvedAt: row.approvedAt,
    };
  }

  /**
   * Reject a register. PAYROLL or ADMIN only.
   */
  async rejectRegister(user: ReqUser, registerId: string, reason?: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'PAYROLL' && user.roleCode !== 'ADMIN') {
      throw new ForbiddenException(
        'Only payroll or admin users can reject registers',
      );
    }
    const row = await this.rrRepo.findOne({ where: { id: registerId } });
    if (!row) throw new BadRequestException('Register not found');
    await this.scope.assertPayrollAccessToClient(user, row.clientId);

    row.approvalStatus = 'REJECTED';
    row.approvedByUserId = user.id;
    row.approvedAt = new Date();
    await this.rrRepo.save(row);
    return {
      id: row.id,
      approvalStatus: row.approvalStatus,
      approvedAt: row.approvedAt,
      reason: reason ?? null,
    };
  }

  // ── Auditor Register Access ────────────────────────────

  /**
   * List registers for AUDITOR. Only registers belonging to clients
   * where the auditor has a PAYROLL-type audit assigned (IN_PROGRESS or PLANNED).
   */
  async auditorListRegisters(user: ReqUser, q: Record<string, any>) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Only auditors can access this resource');
    }

    // Find client IDs where this auditor has a PAYROLL-type audit assigned
    const audits = await this.auditRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.client_id', 'clientId')
      .where('a.assigned_auditor_id = :uid', { uid: user.id })
      .andWhere('a.audit_type = :type', { type: 'PAYROLL' })
      .andWhere('a.status IN (:...statuses)', {
        statuses: ['PLANNED', 'IN_PROGRESS'],
      })
      .getRawMany<{ clientId: string }>();

    const allowedClientIds = audits.map((a) => a.clientId);
    if (allowedClientIds.length === 0) return [];

    // If clientId filter passed, check access
    let clientIds = allowedClientIds;
    if (q?.clientId) {
      if (!allowedClientIds.includes(q.clientId)) {
        throw new ForbiddenException(
          'No payroll audit assigned for this client',
        );
      }
      clientIds = [q.clientId];
    }

    const qb = this.rrRepo
      .createQueryBuilder('r')
      .where('r.client_id IN (:...ids)', { ids: clientIds });

    if (q?.branchId) qb.andWhere('r.branch_id = :b', { b: q.branchId });
    if (q?.periodYear)
      qb.andWhere('r.period_year = :y', { y: Number(q.periodYear) });
    if (q?.periodMonth)
      qb.andWhere('r.period_month = :m', { m: Number(q.periodMonth) });
    if (q?.category) qb.andWhere('r.category = :cat', { cat: q.category });

    qb.orderBy('r.created_at', 'DESC');
    const rows = await qb.getMany();
    return rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      branchId: r.branchId ?? null,
      category: r.category,
      title: r.title,
      registerType: r.registerType ?? null,
      stateCode: r.stateCode ?? null,
      periodYear: r.periodYear ?? null,
      periodMonth: r.periodMonth ?? null,
      fileName: r.fileName ?? null,
      fileType: r.fileType ?? null,
      approvalStatus: r.approvalStatus,
      approvedAt: r.approvedAt ?? null,
      createdAt: r.createdAt,
      downloadUrl: `/api/auditor/registers/${r.id}/download`,
    }));
  }

  /**
   * Download a register for AUDITOR. Only when auditor has PAYROLL audit for the client.
   */
  async downloadRegisterForAuditor(user: ReqUser, registerId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user.roleCode !== 'AUDITOR') {
      throw new ForbiddenException('Only auditors can access this resource');
    }
    const row = await this.rrRepo.findOne({ where: { id: registerId } });
    if (!row) throw new BadRequestException('Register not found');

    // Check auditor has payroll audit for this client
    const audit = await this.auditRepo.findOne({
      where: {
        assignedAuditorId: user.id,
        clientId: row.clientId,
        auditType: AuditType.PAYROLL,
      },
    });
    if (
      !audit ||
      (audit.status !== 'PLANNED' && audit.status !== 'IN_PROGRESS')
    ) {
      throw new ForbiddenException('No active payroll audit for this client');
    }

    const buffer = fs.readFileSync(row.filePath);
    return { fileName: row.fileName, fileType: row.fileType, buffer };
  }
}
