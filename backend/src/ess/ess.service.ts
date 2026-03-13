import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { EmployeeStatutoryEntity } from '../employees/entities/employee-statutory.entity';
import { EmployeeNominationEntity } from '../employees/entities/employee-nomination.entity';
import { EmployeeNominationMemberEntity } from '../employees/entities/employee-nomination-member.entity';
import { LeaveApplicationEntity } from './entities/leave-application.entity';
import { LeaveBalanceEntity } from './entities/leave-balance.entity';
import { LeaveLedgerEntity } from './entities/leave-ledger.entity';
import { LeavePolicyEntity } from './entities/leave-policy.entity';
import { PayrollPayslipArchiveEntity } from '../payroll/entities/payroll-payslip-archive.entity';
import { PayrollRunEntity } from '../payroll/entities/payroll-run.entity';
import { PayrollRunEmployeeEntity } from '../payroll/entities/payroll-run-employee.entity';
import { PayrollRunComponentValueEntity } from '../payroll/entities/payroll-run-component-value.entity';
import { ClientEntity } from '../clients/entities/client.entity';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────
export type EssUser = {
  id: string;
  email: string;
  roleCode: string;
  clientId: string | null;
  employeeId: string | null;
};

// ─── Service ──────────────────────────────────────────────────
@Injectable()
export class EssService {
  private readonly logger = new Logger(EssService.name);

  constructor(
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    @InjectRepository(EmployeeStatutoryEntity)
    private readonly statutoryRepo: Repository<EmployeeStatutoryEntity>,
    @InjectRepository(EmployeeNominationEntity)
    private readonly nomRepo: Repository<EmployeeNominationEntity>,
    @InjectRepository(EmployeeNominationMemberEntity)
    private readonly nomMemberRepo: Repository<EmployeeNominationMemberEntity>,
    @InjectRepository(LeaveApplicationEntity)
    private readonly leaveAppRepo: Repository<LeaveApplicationEntity>,
    @InjectRepository(LeaveBalanceEntity)
    private readonly leaveBalRepo: Repository<LeaveBalanceEntity>,
    @InjectRepository(LeaveLedgerEntity)
    private readonly leaveLedgerRepo: Repository<LeaveLedgerEntity>,
    @InjectRepository(LeavePolicyEntity)
    private readonly leavePolicyRepo: Repository<LeavePolicyEntity>,
    @InjectRepository(PayrollPayslipArchiveEntity)
    private readonly payslipRepo: Repository<PayrollPayslipArchiveEntity>,
    @InjectRepository(PayrollRunEntity)
    private readonly runRepo: Repository<PayrollRunEntity>,
    @InjectRepository(PayrollRunEmployeeEntity)
    private readonly runEmpRepo: Repository<PayrollRunEmployeeEntity>,
    @InjectRepository(PayrollRunComponentValueEntity)
    private readonly compValRepo: Repository<PayrollRunComponentValueEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    private readonly ds: DataSource,
  ) {}

  // ── Helpers ──────────────────────────────────────────────
  private ensureEmployee(user: EssUser): string {
    if (!user.employeeId) {
      throw new ForbiddenException('No employee record linked to this user');
    }
    return user.employeeId;
  }

  private resolveMonthRange(month?: string) {
    const safe =
      month && /^\d{4}-\d{2}$/.test(month)
        ? month
        : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const start = new Date(`${safe}-01T00:00:00.000Z`);
    const end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
    );

    return {
      month: safe,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      daysInMonth: new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    };
  }

  private mapDocCategory(docType?: string | null): string {
    const t = String(docType || '').toUpperCase();
    if (
      ['AADHAAR', 'PAN', 'PASSPORT', 'VOTER_ID', 'DRIVING_LICENSE'].includes(t)
    ) {
      return 'IDENTITY';
    }
    if (['UAN', 'PF', 'ESI', 'ESIC', 'PT', 'LWF'].includes(t)) {
      return 'STATUTORY';
    }
    if (
      [
        'OFFER_LETTER',
        'APPOINTMENT_LETTER',
        'INCREMENT_LETTER',
        'EXPERIENCE_LETTER',
        'RELIEVING_LETTER',
      ].includes(t)
    ) {
      return 'EMPLOYMENT';
    }
    if (['BANK', 'CANCELLED_CHEQUE', 'PASSBOOK'].includes(t)) {
      return 'BANK';
    }
    return 'OTHER';
  }

  // ── Company Branding ──────────────────────────────────
  async getCompanyBranding(user: EssUser) {
    if (!user.clientId) {
      return {
        clientName: 'Company',
        clientCode: null,
        logoUrl: null,
        branchName: null,
      };
    }
    const client = await this.clientRepo.findOne({
      where: { id: user.clientId },
    });
    if (!client) {
      return {
        clientName: 'Company',
        clientCode: null,
        logoUrl: null,
        branchName: null,
      };
    }

    // Optionally resolve branch name from employee record
    let branchName: string | null = null;
    if (user.employeeId) {
      const emp = await this.empRepo.findOne({
        where: { id: user.employeeId },
      });
      branchName = (emp as any)?.branchName ?? null;
    }

    return {
      clientId: client.id,
      clientCode: client.clientCode,
      clientName: client.clientName,
      logoUrl: client.logoUrl ?? null,
      branchName,
    };
  }

  // ── Profile ──────────────────────────────────────────────
  async getProfile(user: EssUser) {
    const empId = this.ensureEmployee(user);
    const emp = await this.empRepo.findOne({ where: { id: empId } });
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }

  /** Allow employees to update limited self-service fields */
  async updateProfile(
    user: EssUser,
    body: {
      phone?: string;
      email?: string;
      bankName?: string;
      bankAccount?: string;
      ifsc?: string;
      fatherName?: string;
    },
  ) {
    const empId = this.ensureEmployee(user);
    const emp = await this.empRepo.findOne({ where: { id: empId } });
    if (!emp) throw new NotFoundException('Employee not found');

    // Only allow safe self-service fields — no salary, role, or code changes
    const allowed: (keyof typeof body)[] = [
      'phone',
      'email',
      'bankName',
      'bankAccount',
      'ifsc',
      'fatherName',
    ];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        (emp as any)[key] = body[key];
      }
    }
    return this.empRepo.save(emp);
  }

  // ── Statutory Details (PF / ESI) ────────────────────────
  async getStatutory(user: EssUser) {
    const empId = this.ensureEmployee(user);
    const emp = await this.empRepo.findOne({ where: { id: empId } });
    if (!emp) throw new NotFoundException('Employee not found');

    // Try dedicated table first, fallback to employee master fields
    const stat = await this.statutoryRepo.findOne({
      where: { employeeId: empId },
    });

    return {
      pf: {
        uan: stat?.pfUan ?? emp.uan ?? null,
        memberId: stat?.pfMemberId ?? null,
        joinDate: stat?.pfJoinDate ?? emp.pfApplicableFrom ?? null,
        exitDate: stat?.pfExitDate ?? null,
        applicable: emp.pfApplicable,
        registered: emp.pfRegistered,
        wages: stat?.pfWages ?? null,
      },
      esi: {
        ipNumber: stat?.esiIpNumber ?? emp.esic ?? null,
        dispensary: stat?.esiDispensary ?? null,
        joinDate: stat?.esiJoinDate ?? emp.esiApplicableFrom ?? null,
        exitDate: stat?.esiExitDate ?? null,
        applicable: emp.esiApplicable,
        registered: emp.esiRegistered,
        wages: stat?.esiWages ?? null,
      },
      pt: {
        registrationNumber: stat?.ptRegistrationNumber ?? null,
      },
      lwf: {
        applicable: stat?.lwfApplicable ?? false,
      },
    };
  }

  // ── Contributions (monthly PF/ESI from payroll) ─────────
  async getContributions(user: EssUser, from?: string, to?: string) {
    const empId = this.ensureEmployee(user);
    const emp = await this.empRepo.findOne({ where: { id: empId } });
    if (!emp) return [];

    // Default range: last 12 months
    const now = new Date();
    const defaultFrom = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const defaultTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const rangeFrom = from ?? defaultFrom;
    const rangeTo = to ?? defaultTo;

    // Parse year/month bounds
    const [fromY, fromM] = rangeFrom.split('-').map(Number);
    const [toY, toM] = rangeTo.split('-').map(Number);

    // Find payroll run employees for this employee within the period
    const runEmps = await this.runEmpRepo
      .createQueryBuilder('re')
      .innerJoin(PayrollRunEntity, 'r', 'r.id = re.run_id')
      .where('re.employee_code = :code', { code: emp.employeeCode })
      .andWhere('re.client_id = :clientId', { clientId: emp.clientId })
      .andWhere(
        '(r.period_year * 100 + r.period_month) >= :fromPeriod AND (r.period_year * 100 + r.period_month) <= :toPeriod',
        { fromPeriod: fromY * 100 + fromM, toPeriod: toY * 100 + toM },
      )
      .select([
        're.id AS "runEmployeeId"',
        'r.period_year AS "periodYear"',
        'r.period_month AS "periodMonth"',
        're.gross_earnings AS "grossEarnings"',
      ])
      .orderBy('r.period_year', 'ASC')
      .addOrderBy('r.period_month', 'ASC')
      .getRawMany();

    if (!runEmps.length) return [];

    // Get component values for all these run employees
    const reIds = runEmps.map((re) => re.runEmployeeId);
    const compValues = await this.compValRepo
      .createQueryBuilder('cv')
      .where('cv.run_employee_id IN (:...ids)', { ids: reIds })
      .andWhere('cv.component_code IN (:...codes)', {
        codes: [
          'PF_EE',
          'PF_ER',
          'EPS_ER',
          'ESI_EE',
          'ESI_ER',
          'PT',
          'LWF_EE',
          'LWF_ER',
        ],
      })
      .getMany();

    // Build a map: runEmployeeId → { componentCode → amount }
    const cvMap: Record<string, Record<string, string>> = {};
    for (const cv of compValues) {
      (cvMap[cv.runEmployeeId] ??= {})[cv.componentCode] = cv.amount;
    }

    return runEmps.map((re) => {
      const cv = cvMap[re.runEmployeeId] ?? {};
      return {
        periodYear: Number(re.periodYear),
        periodMonth: Number(re.periodMonth),
        grossEarnings: re.grossEarnings,
        pfEmployee: cv['PF_EE'] ?? '0',
        pfEmployer: cv['PF_ER'] ?? '0',
        epsEmployer: cv['EPS_ER'] ?? '0',
        esiEmployee: cv['ESI_EE'] ?? '0',
        esiEmployer: cv['ESI_ER'] ?? '0',
        pt: cv['PT'] ?? '0',
        lwfEmployee: cv['LWF_EE'] ?? '0',
        lwfEmployer: cv['LWF_ER'] ?? '0',
      };
    });
  }

  // ── Payslip Download (PDF stream) ───────────────────────
  async getPayslipForDownload(user: EssUser, payslipId: string) {
    const empId = this.ensureEmployee(user);
    const emp = await this.empRepo.findOne({ where: { id: empId } });
    if (!emp) throw new NotFoundException('Employee not found');

    const payslip = await this.payslipRepo.findOne({
      where: {
        id: payslipId,
        clientId: emp.clientId,
        employeeCode: emp.employeeCode,
      },
    });
    if (!payslip) throw new NotFoundException('Payslip not found');

    // Resolve file path
    const filePath = path.isAbsolute(payslip.filePath)
      ? payslip.filePath
      : path.join(process.cwd(), payslip.filePath);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Payslip file not available on disk');
    }

    return {
      stream: fs.createReadStream(filePath),
      fileName: payslip.fileName,
      fileType: payslip.fileType,
      fileSize: payslip.fileSize,
    };
  }

  // -- Attendance / Holidays --------------------------------------------------
  async getAttendance(user: EssUser, month?: string) {
    const empId = this.ensureEmployee(user);
    const emp = await this.empRepo.findOne({ where: { id: empId } });
    if (!emp) throw new NotFoundException('Employee not found');

    const range = this.resolveMonthRange(month);
    const rows = await this.ds
      .query(
        `SELECT
           a.date,
           a.status,
           a.check_in AS "checkIn",
           a.check_out AS "checkOut",
           a.worked_hours AS "workedHours",
           a.overtime_hours AS "overtimeHours",
           a.remarks,
           a.source
         FROM attendance_records a
         WHERE a.employee_id = $1
           AND a.date >= $2::date
           AND a.date < $3::date
         ORDER BY a.date ASC`,
        [emp.id, range.startDate, range.endDate],
      )
      .catch(() => []);

    return {
      month: range.month,
      daysInMonth: range.daysInMonth,
      records: rows,
    };
  }

  async getAttendanceSummary(user: EssUser, month?: string) {
    const data = await this.getAttendance(user, month);
    const counters = {
      present: 0,
      absent: 0,
      halfDay: 0,
      onLeave: 0,
      holidays: 0,
      weekOff: 0,
    };

    for (const row of data.records) {
      const status = String(row.status || '').toUpperCase();
      if (status === 'PRESENT') counters.present += 1;
      else if (status === 'ABSENT') counters.absent += 1;
      else if (status === 'HALF_DAY') counters.halfDay += 1;
      else if (status === 'ON_LEAVE') counters.onLeave += 1;
      else if (status === 'HOLIDAY') counters.holidays += 1;
      else if (status === 'WEEK_OFF') counters.weekOff += 1;
    }

    const workedDays =
      counters.present + counters.onLeave + counters.halfDay * 0.5;

    return {
      month: data.month,
      daysInMonth: data.daysInMonth,
      recordedDays: data.records.length,
      workedDays: Number(workedDays.toFixed(1)),
      ...counters,
    };
  }

  async getHolidays(user: EssUser, month?: string) {
    const empId = this.ensureEmployee(user);
    const emp = await this.empRepo.findOne({ where: { id: empId } });
    if (!emp) throw new NotFoundException('Employee not found');

    const range = this.resolveMonthRange(month);
    const rows = await this.ds
      .query(
        `SELECT
           a.date,
           a.status,
           COALESCE(NULLIF(a.remarks, ''), CASE WHEN a.status = 'WEEK_OFF' THEN 'Weekly Off' ELSE 'Holiday' END) AS label
         FROM attendance_records a
         WHERE a.employee_id = $1
           AND a.date >= $2::date
           AND a.date < $3::date
           AND a.status IN ('HOLIDAY', 'WEEK_OFF')
         ORDER BY a.date ASC`,
        [emp.id, range.startDate, range.endDate],
      )
      .catch(() => []);

    return {
      month: range.month,
      items: rows,
    };
  }

  // -- Employee Document Vault ------------------------------------------------
  async listDocuments(
    user: EssUser,
    opts?: { category?: string; year?: number; q?: string },
  ) {
    const empId = this.ensureEmployee(user);
    const emp = await this.empRepo.findOne({ where: { id: empId } });
    if (!emp) throw new NotFoundException('Employee not found');

    const rows = await this.ds
      .query(
        `SELECT
           d.id,
           d.doc_type AS "docType",
           d.doc_name AS "docName",
           d.file_name AS "fileName",
           d.file_size AS "fileSize",
           d.mime_type AS "mimeType",
           d.expiry_date AS "expiryDate",
           d.is_verified AS "isVerified",
           d.created_at AS "createdAt",
           d.updated_at AS "updatedAt"
         FROM employee_documents d
         WHERE d.client_id = $1
           AND d.employee_id = $2
         ORDER BY d.created_at DESC`,
        [emp.clientId, emp.id],
      )
      .catch(() => []);

    const categoryFilter = String(opts?.category || '').toUpperCase();
    const yearFilter = opts?.year ? Number(opts.year) : null;
    const q = String(opts?.q || '').trim().toLowerCase();

    let items = rows.map((r: any) => ({
      ...r,
      category: this.mapDocCategory(r.docType),
    }));

    if (categoryFilter && categoryFilter !== 'ALL') {
      items = items.filter((r: any) => r.category === categoryFilter);
    }
    if (yearFilter) {
      items = items.filter((r: any) => {
        if (!r.createdAt) return false;
        const y = new Date(r.createdAt).getFullYear();
        return y === yearFilter;
      });
    }
    if (q) {
      items = items.filter((r: any) => {
        const hay = `${r.docType || ''} ${r.docName || ''} ${r.fileName || ''}`.toLowerCase();
        return hay.includes(q);
      });
    }

    return {
      total: items.length,
      items,
    };
  }

  async getDocumentById(user: EssUser, documentId: string) {
    const empId = this.ensureEmployee(user);
    const emp = await this.empRepo.findOne({ where: { id: empId } });
    if (!emp) throw new NotFoundException('Employee not found');

    const [doc] = await this.ds
      .query(
        `SELECT
           d.id,
           d.doc_type AS "docType",
           d.doc_name AS "docName",
           d.file_name AS "fileName",
           d.file_path AS "filePath",
           d.file_size AS "fileSize",
           d.mime_type AS "mimeType",
           d.expiry_date AS "expiryDate",
           d.is_verified AS "isVerified",
           d.created_at AS "createdAt",
           d.updated_at AS "updatedAt"
         FROM employee_documents d
         WHERE d.id = $1
           AND d.client_id = $2
           AND d.employee_id = $3
         LIMIT 1`,
        [documentId, emp.clientId, emp.id],
      )
      .catch(() => [null]);

    if (!doc) throw new NotFoundException('Document not found');
    return {
      ...doc,
      category: this.mapDocCategory(doc.docType),
    };
  }

  async getDocumentForDownload(user: EssUser, documentId: string) {
    const doc = await this.getDocumentById(user, documentId);
    const filePath = path.isAbsolute(doc.filePath)
      ? doc.filePath
      : path.join(process.cwd(), doc.filePath);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Document file not available on disk');
    }

    return {
      stream: fs.createReadStream(filePath),
      fileName: doc.docName || doc.fileName || 'document',
      fileType: doc.mimeType || 'application/octet-stream',
      fileSize: doc.fileSize || 0,
    };
  }

  // ── Nominations ──────────────────────────────────────────
  async listNominations(user: EssUser) {
    const empId = this.ensureEmployee(user);
    const noms = await this.nomRepo.find({
      where: { employeeId: empId },
      order: { createdAt: 'DESC' },
    });
    // Attach members
    const nomIds = noms.map((n) => n.id);
    const membersMap: Record<string, EmployeeNominationMemberEntity[]> = {};
    if (nomIds.length) {
      const members = await this.nomMemberRepo
        .createQueryBuilder('m')
        .where('m.nomination_id IN (:...ids)', { ids: nomIds })
        .orderBy('m.created_at', 'ASC')
        .getMany();
      for (const m of members) {
        (membersMap[m.nominationId] ??= []).push(m);
      }
    }
    return noms.map((n) => ({
      ...n,
      members: membersMap[n.id] ?? [],
    }));
  }

  async createNomination(user: EssUser, dto: any) {
    const empId = this.ensureEmployee(user);
    const emp = await this.empRepo.findOne({ where: { id: empId } });
    if (!emp) throw new NotFoundException('Employee not found');

    // Determine status: save as DRAFT or directly SUBMITTED
    const asDraft = dto.asDraft === true;

    const nom = this.nomRepo.create({
      employeeId: empId,
      clientId: emp.clientId,
      branchId: emp.branchId,
      nominationType: dto.nominationType,
      declarationDate: dto.declarationDate || null,
      witnessName: dto.witnessName || null,
      witnessAddress: dto.witnessAddress || null,
      status: asDraft ? 'DRAFT' : 'SUBMITTED',
      submittedAt: asDraft ? null : new Date(),
    });
    const saved = await this.nomRepo.save(nom);

    // Save members
    const members = (dto.members ?? []).filter((m: any) =>
      m.memberName?.trim(),
    );
    if (members.length) {
      const entities = members.map((m: any) =>
        this.nomMemberRepo.create({
          nominationId: saved.id,
          memberName: m.memberName.trim(),
          relationship: m.relationship || null,
          dateOfBirth: m.dateOfBirth || null,
          sharePct: m.sharePct ?? 0,
          address: m.address || null,
          isMinor: !!m.isMinor,
          guardianName: m.guardianName || null,
        }),
      );
      await this.nomMemberRepo.save(entities);
    }

    return { id: saved.id, status: saved.status };
  }

  // Submit a DRAFT nomination
  async submitNomination(user: EssUser, nominationId: string) {
    const empId = this.ensureEmployee(user);
    const nom = await this.nomRepo.findOne({
      where: { id: nominationId, employeeId: empId },
    });
    if (!nom) throw new NotFoundException('Nomination not found');
    if (nom.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT nominations can be submitted');
    }
    nom.status = 'SUBMITTED';
    nom.submittedAt = new Date();
    nom.rejectionReason = null;
    await this.nomRepo.save(nom);
    return { ok: true, status: 'SUBMITTED' };
  }

  // Resubmit a REJECTED nomination (clears rejection, goes back to SUBMITTED)
  async resubmitNomination(user: EssUser, nominationId: string, dto: any) {
    const empId = this.ensureEmployee(user);
    const nom = await this.nomRepo.findOne({
      where: { id: nominationId, employeeId: empId },
    });
    if (!nom) throw new NotFoundException('Nomination not found');
    if (nom.status !== 'REJECTED') {
      throw new BadRequestException(
        'Only REJECTED nominations can be resubmitted',
      );
    }

    // Allow updating fields on resubmit
    if (dto.witnessName !== undefined) nom.witnessName = dto.witnessName;
    if (dto.witnessAddress !== undefined)
      nom.witnessAddress = dto.witnessAddress;
    if (dto.declarationDate !== undefined)
      nom.declarationDate = dto.declarationDate;

    nom.status = 'SUBMITTED';
    nom.submittedAt = new Date();
    nom.rejectionReason = null;
    nom.approvedAt = null;
    nom.approvedByUserId = null;
    await this.nomRepo.save(nom);

    // Replace members if provided
    const members = (dto.members ?? []).filter((m: any) =>
      m.memberName?.trim(),
    );
    if (members.length) {
      await this.nomMemberRepo.delete({ nominationId });
      const entities = members.map((m: any) =>
        this.nomMemberRepo.create({
          nominationId,
          memberName: m.memberName.trim(),
          relationship: m.relationship || null,
          dateOfBirth: m.dateOfBirth || null,
          sharePct: m.sharePct ?? 0,
          address: m.address || null,
          isMinor: !!m.isMinor,
          guardianName: m.guardianName || null,
        }),
      );
      await this.nomMemberRepo.save(entities);
    }

    return { ok: true, status: 'SUBMITTED' };
  }

  // ── Leave Balances ───────────────────────────────────────
  async getLeaveBalances(user: EssUser, year?: number) {
    const empId = this.ensureEmployee(user);
    const yr = year ?? new Date().getFullYear();
    return this.leaveBalRepo.find({
      where: { employeeId: empId, year: yr },
      order: { leaveType: 'ASC' },
    });
  }

  // ── Leave Policies (read-only for employee) ──────────────
  async getLeavePolicies(user: EssUser) {
    const empId = this.ensureEmployee(user);
    const emp = await this.empRepo.findOne({ where: { id: empId } });
    if (!emp) throw new NotFoundException('Employee not found');
    return this.leavePolicyRepo.find({
      where: { clientId: emp.clientId, isActive: true },
      order: { leaveType: 'ASC' },
    });
  }

  // ── Leave Applications ───────────────────────────────────
  async listLeaveApplications(user: EssUser) {
    const empId = this.ensureEmployee(user);
    return this.leaveAppRepo.find({
      where: { employeeId: empId },
      order: { createdAt: 'DESC' },
    });
  }

  async applyLeave(user: EssUser, dto: any) {
    const empId = this.ensureEmployee(user);
    const emp = await this.empRepo.findOne({ where: { id: empId } });
    if (!emp) throw new NotFoundException('Employee not found');

    if (!dto.leaveType || !dto.fromDate || !dto.toDate) {
      throw new BadRequestException('leaveType, fromDate, toDate are required');
    }

    const from = new Date(dto.fromDate);
    const to = new Date(dto.toDate);
    if (to < from) throw new BadRequestException('toDate must be >= fromDate');

    // Calculate total days (simple: calendar days inclusive)
    const diffMs = to.getTime() - from.getTime();
    const totalDays = dto.totalDays ?? Math.ceil(diffMs / 86400000) + 1;

    // Check balance
    const yr = from.getFullYear();
    const bal = await this.leaveBalRepo.findOne({
      where: { employeeId: empId, year: yr, leaveType: dto.leaveType },
    });
    const available = bal ? parseFloat(bal.available) : 0;

    // Check if policy allows negative
    const policy = await this.leavePolicyRepo.findOne({
      where: {
        clientId: emp.clientId,
        leaveType: dto.leaveType,
        isActive: true,
      },
    });
    if (!policy)
      throw new BadRequestException(
        `No leave policy found for type ${dto.leaveType}`,
      );
    if (!policy.allowNegative && totalDays > available) {
      throw new BadRequestException(
        `Insufficient leave balance. Available: ${available}, Requested: ${totalDays}`,
      );
    }

    const app = this.leaveAppRepo.create({
      employeeId: empId,
      clientId: emp.clientId,
      branchId: emp.branchId,
      leaveType: dto.leaveType,
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      totalDays: String(totalDays),
      reason: dto.reason || null,
      status: 'SUBMITTED',
      appliedAt: new Date(),
    });
    const saved = await this.leaveAppRepo.save(app);

    return { id: saved.id, status: saved.status, totalDays };
  }

  async cancelLeave(user: EssUser, leaveId: string) {
    const empId = this.ensureEmployee(user);
    const app = await this.leaveAppRepo.findOne({
      where: { id: leaveId, employeeId: empId },
    });
    if (!app) throw new NotFoundException('Leave application not found');
    if (!['DRAFT', 'SUBMITTED'].includes(app.status)) {
      throw new BadRequestException(
        'Can only cancel DRAFT or SUBMITTED leave requests',
      );
    }
    app.status = 'CANCELLED';
    app.actionedAt = new Date();
    await this.leaveAppRepo.save(app);
    return { ok: true };
  }

  // ── Payslips ─────────────────────────────────────────────
  async listPayslips(user: EssUser) {
    const empId = this.ensureEmployee(user);
    const emp = await this.empRepo.findOne({ where: { id: empId } });
    if (!emp) return [];
    return this.payslipRepo.find({
      where: { clientId: emp.clientId, employeeCode: emp.employeeCode },
      order: { periodYear: 'DESC', periodMonth: 'DESC' },
    });
  }

  // ── Branch Approval: Nominations ─────────────────────────
  async listPendingNominations(clientId: string, branchId?: string) {
    const qb = this.nomRepo
      .createQueryBuilder('n')
      .where('n.clientId = :clientId', { clientId })
      .andWhere('n.status = :status', { status: 'SUBMITTED' });
    if (branchId) qb.andWhere('n.branchId = :branchId', { branchId });
    qb.orderBy('n.submittedAt', 'ASC');
    const noms = await qb.getMany();

    // Attach members + employee name
    const empIds = [...new Set(noms.map((n) => n.employeeId))];
    const nomIds = noms.map((n) => n.id);
    let empMap: Record<string, any> = {};
    if (empIds.length) {
      const emps = await this.empRepo
        .createQueryBuilder('e')
        .whereInIds(empIds)
        .getMany();
      empMap = Object.fromEntries(emps.map((e) => [e.id, e]));
    }
    const membersMap: Record<string, any[]> = {};
    if (nomIds.length) {
      const members = await this.nomMemberRepo
        .createQueryBuilder('m')
        .where('m.nominationId IN (:...ids)', { ids: nomIds })
        .getMany();
      for (const m of members) (membersMap[m.nominationId] ??= []).push(m);
    }
    return noms.map((n) => ({
      ...n,
      employee: empMap[n.employeeId] ?? null,
      members: membersMap[n.id] ?? [],
    }));
  }

  async approveNomination(nomId: string, userId: string) {
    const nom = await this.nomRepo.findOne({ where: { id: nomId } });
    if (!nom) throw new NotFoundException('Nomination not found');
    if (nom.status !== 'SUBMITTED')
      throw new BadRequestException('Not in SUBMITTED status');
    nom.status = 'APPROVED';
    nom.approvedAt = new Date();
    nom.approvedByUserId = userId;
    await this.nomRepo.save(nom);
    return { ok: true };
  }

  async rejectNomination(nomId: string, userId: string, reason?: string) {
    const nom = await this.nomRepo.findOne({ where: { id: nomId } });
    if (!nom) throw new NotFoundException('Nomination not found');
    if (nom.status !== 'SUBMITTED')
      throw new BadRequestException('Not in SUBMITTED status');
    nom.status = 'REJECTED';
    nom.approvedAt = new Date();
    nom.approvedByUserId = userId;
    nom.rejectionReason = reason || null;
    await this.nomRepo.save(nom);
    return { ok: true };
  }

  // ── Branch Approval: Leave Applications ──────────────────
  async listPendingLeaves(clientId: string, branchId?: string) {
    const qb = this.leaveAppRepo
      .createQueryBuilder('la')
      .where('la.clientId = :clientId', { clientId })
      .andWhere('la.status = :status', { status: 'SUBMITTED' });
    if (branchId) qb.andWhere('la.branchId = :branchId', { branchId });
    qb.orderBy('la.appliedAt', 'ASC');
    const apps = await qb.getMany();

    const empIds = [...new Set(apps.map((a) => a.employeeId))];
    let empMap: Record<string, any> = {};
    if (empIds.length) {
      const emps = await this.empRepo
        .createQueryBuilder('e')
        .whereInIds(empIds)
        .getMany();
      empMap = Object.fromEntries(emps.map((e) => [e.id, e]));
    }
    return apps.map((a) => ({
      ...a,
      employee: empMap[a.employeeId] ?? null,
    }));
  }

  /**
   * Unified client approvals queue (leave + nomination).
   * Supports optional type filter for compatibility with /client/approvals.
   */
  async listClientApprovals(
    clientId: string,
    branchId?: string,
    type?: 'LEAVE' | 'NOMINATION',
  ) {
    if (type === 'LEAVE') {
      return this.listPendingLeaves(clientId, branchId);
    }
    if (type === 'NOMINATION') {
      return this.listPendingNominations(clientId, branchId);
    }
    const [leaves, nominations] = await Promise.all([
      this.listPendingLeaves(clientId, branchId),
      this.listPendingNominations(clientId, branchId),
    ]);
    return { leaves, nominations };
  }

  /**
   * Resolve approval item across nomination/leave for unified endpoints.
   */
  async getClientApprovalById(
    clientId: string,
    id: string,
    type?: 'LEAVE' | 'NOMINATION',
  ): Promise<any> {
    if (type === 'NOMINATION') {
      const nom = await this.nomRepo.findOne({ where: { id, clientId } });
      if (!nom) throw new NotFoundException('Approval item not found');
      return { type: 'NOMINATION', ...nom };
    }
    if (type === 'LEAVE') {
      const leave = await this.leaveAppRepo.findOne({ where: { id, clientId } });
      if (!leave) throw new NotFoundException('Approval item not found');
      return { type: 'LEAVE', ...leave };
    }

    const nom = await this.nomRepo.findOne({ where: { id, clientId } });
    if (nom) return { type: 'NOMINATION', ...nom };

    const leave = await this.leaveAppRepo.findOne({ where: { id, clientId } });
    if (leave) return { type: 'LEAVE', ...leave };

    throw new NotFoundException('Approval item not found');
  }

  async getClientApprovalHistory(
    clientId: string,
    id: string,
    type?: 'LEAVE' | 'NOMINATION',
  ) {
    const item = await this.getClientApprovalById(clientId, id, type);
    const events: Array<{
      at: string | null;
      event: string;
      status: string | null;
      note?: string | null;
    }> = [];

    if (item.createdAt) {
      events.push({
        at: item.createdAt,
        event: 'Created',
        status: item.status || null,
      });
    }

    if (item.type === 'NOMINATION') {
      if (item.submittedAt) {
        events.push({
          at: item.submittedAt,
          event: 'Submitted',
          status: item.status || null,
        });
      }
      if (item.approvedAt) {
        events.push({
          at: item.approvedAt,
          event: item.status === 'APPROVED' ? 'Approved' : 'Reviewed',
          status: item.status || null,
          note: item.rejectionReason || null,
        });
      }
    } else {
      if (item.appliedAt) {
        events.push({
          at: item.appliedAt,
          event: 'Submitted',
          status: item.status || null,
        });
      }
      if (item.actionedAt) {
        events.push({
          at: item.actionedAt,
          event: item.status === 'APPROVED' ? 'Approved' : 'Reviewed',
          status: item.status || null,
          note: item.rejectionReason || null,
        });
      }
    }

    events.sort((a, b) => {
      const at = a.at ? new Date(a.at).getTime() : 0;
      const bt = b.at ? new Date(b.at).getTime() : 0;
      return at - bt;
    });

    return {
      id: item.id,
      type: item.type,
      status: item.status,
      branchId: item.branchId || null,
      events,
    };
  }

  async approveClientApproval(
    clientId: string,
    id: string,
    userId: string,
    type?: 'LEAVE' | 'NOMINATION',
  ) {
    const item = await this.getClientApprovalById(clientId, id, type);
    if (item.type === 'NOMINATION') return this.approveNomination(id, userId);
    return this.approveLeave(id, userId);
  }

  async rejectClientApproval(
    clientId: string,
    id: string,
    userId: string,
    reason?: string,
    type?: 'LEAVE' | 'NOMINATION',
  ) {
    const item = await this.getClientApprovalById(clientId, id, type);
    if (item.type === 'NOMINATION') return this.rejectNomination(id, userId, reason);
    return this.rejectLeave(id, userId, reason);
  }

  async approveLeave(leaveId: string, userId: string) {
    const app = await this.leaveAppRepo.findOne({ where: { id: leaveId } });
    if (!app) throw new NotFoundException('Leave application not found');
    if (app.status !== 'SUBMITTED')
      throw new BadRequestException('Not in SUBMITTED status');

    return this.ds.transaction(async (mgr) => {
      // Update application
      app.status = 'APPROVED';
      app.approverUserId = userId;
      app.actionedAt = new Date();
      await mgr.save(app);

      // Debit leave balance
      const yr = new Date(app.fromDate).getFullYear();
      const totalDays = parseFloat(app.totalDays);
      await mgr
        .createQueryBuilder()
        .update(LeaveBalanceEntity)
        .set({
          used: () => `used + ${totalDays}`,
          available: () => `available - ${totalDays}`,
          lastUpdatedAt: new Date(),
        })
        .where('employee_id = :eid AND year = :yr AND leave_type = :lt', {
          eid: app.employeeId,
          yr,
          lt: app.leaveType,
        })
        .execute();

      // Ledger entry
      const ledger = mgr.create(LeaveLedgerEntity, {
        employeeId: app.employeeId,
        clientId: app.clientId,
        leaveType: app.leaveType,
        entryDate: app.fromDate,
        qty: String(-totalDays),
        refType: 'APPLICATION',
        refId: app.id,
        remarks: `Leave approved ${app.fromDate} to ${app.toDate}`,
      });
      await mgr.save(ledger);

      return { ok: true };
    });
  }

  async rejectLeave(leaveId: string, userId: string, reason?: string) {
    const app = await this.leaveAppRepo.findOne({ where: { id: leaveId } });
    if (!app) throw new NotFoundException('Leave application not found');
    if (app.status !== 'SUBMITTED')
      throw new BadRequestException('Not in SUBMITTED status');
    app.status = 'REJECTED';
    app.approverUserId = userId;
    app.actionedAt = new Date();
    app.rejectionReason = reason || null;
    await this.leaveAppRepo.save(app);
    return { ok: true };
  }

  // ── Leave Policy Management ──────────────────────────────

  async listClientLeavePolicies(clientId: string) {
    return this.leavePolicyRepo.find({
      where: { clientId },
      order: { leaveType: 'ASC' },
    });
  }

  async createLeavePolicy(clientId: string, dto: any) {
    const policy = this.leavePolicyRepo.create({
      clientId,
      branchId: dto.branchId || null,
      leaveType: dto.leaveType,
      leaveName: dto.leaveName,
      accrualMethod: dto.accrualMethod || 'MONTHLY',
      accrualRate: dto.accrualRate ?? '0',
      carryForwardLimit: dto.carryForwardLimit ?? '0',
      yearlyLimit: dto.yearlyLimit ?? '0',
      allowNegative: dto.allowNegative ?? false,
      minNoticeDays: dto.minNoticeDays ?? 0,
      maxDaysPerRequest: dto.maxDaysPerRequest ?? '0',
      requiresDocument: dto.requiresDocument ?? false,
      isActive: true,
    });
    return this.leavePolicyRepo.save(policy);
  }

  async updateLeavePolicy(clientId: string, id: string, dto: any) {
    const policy = await this.leavePolicyRepo.findOne({
      where: { id, clientId },
    });
    if (!policy) throw new NotFoundException('Leave policy not found');
    Object.assign(policy, dto);
    return this.leavePolicyRepo.save(policy);
  }

  /**
   * Seeds default leave policies (CL, SL, EL) for a client.
   * Skips if policies already exist.
   */
  async seedDefaultLeavePolicies(clientId: string) {
    const existing = await this.leavePolicyRepo.count({ where: { clientId } });
    if (existing > 0) {
      return {
        message: 'Leave policies already exist for this client',
        count: existing,
      };
    }

    const defaults = [
      {
        leaveType: 'CL',
        leaveName: 'Casual Leave',
        accrualMethod: 'YEARLY',
        accrualRate: '12',
        yearlyLimit: '12',
        carryForwardLimit: '0',
        allowNegative: false,
        maxDaysPerRequest: '3',
      },
      {
        leaveType: 'SL',
        leaveName: 'Sick Leave',
        accrualMethod: 'YEARLY',
        accrualRate: '12',
        yearlyLimit: '12',
        carryForwardLimit: '6',
        allowNegative: false,
        maxDaysPerRequest: '7',
        requiresDocument: true,
        minNoticeDays: 0,
      },
      {
        leaveType: 'EL',
        leaveName: 'Earned Leave / Privilege Leave',
        accrualMethod: 'MONTHLY',
        accrualRate: '1.25',
        yearlyLimit: '15',
        carryForwardLimit: '30',
        allowNegative: false,
        maxDaysPerRequest: '15',
        minNoticeDays: 7,
      },
    ];

    const policies = defaults.map((d) =>
      this.leavePolicyRepo.create({ ...d, clientId, isActive: true }),
    );
    await this.leavePolicyRepo.save(policies);
    return { message: 'Default leave policies seeded', count: policies.length };
  }

  /**
   * Initialize leave balances for all active employees of a client
   * for the given year based on existing leave policies.
   */
  async initializeLeaveBalances(clientId: string, year: number) {
    const policies = await this.leavePolicyRepo.find({
      where: { clientId, isActive: true },
    });
    if (!policies.length) {
      throw new BadRequestException(
        'No leave policies found. Please seed or create policies first.',
      );
    }

    const employees = await this.empRepo.find({
      where: { clientId, isActive: true },
    });
    if (!employees.length) {
      return { message: 'No active employees found', initialized: 0 };
    }

    let created = 0;
    let skipped = 0;

    for (const emp of employees) {
      for (const policy of policies) {
        // Skip if balance already exists
        const existing = await this.leaveBalRepo.findOne({
          where: { employeeId: emp.id, year, leaveType: policy.leaveType },
        });
        if (existing) {
          skipped++;
          continue;
        }

        const entitled = parseFloat(policy.yearlyLimit) || 0;
        const bal = this.leaveBalRepo.create({
          employeeId: emp.id,
          clientId,
          leaveType: policy.leaveType,
          year,
          opening: String(entitled),
          accrued: '0',
          used: '0',
          lapsed: '0',
          available: String(entitled),
        });
        await this.leaveBalRepo.save(bal);
        created++;
      }
    }

    return {
      message: `Leave balances initialized for ${year}`,
      created,
      skipped,
      employees: employees.length,
      policies: policies.length,
    };
  }
}
