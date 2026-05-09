import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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
import { AttendanceService } from '../attendance/attendance.service';
import * as fs from 'fs';
import * as path from 'path';
import {
  CreateEssNominationDto,
  ResubmitNominationDto,
  UpdateEssNominationDto,
  ApplyLeaveDto,
  CreateLeavePolicyDto,
  UpdateLeavePolicyDto,
} from './dto/ess.dto';

// ─── Types ────────────────────────────────────────────────────
export type EssUser = {
  id: string;
  email: string;
  roleCode: string;
  clientId: string | null;
  employeeId: string | null;
};

interface DocRow {
  id: string;
  docType: string;
  docName: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  expiryDate: string | null;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Service ──────────────────────────────────────────────────
@Injectable()
export class EssService {
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
    private readonly _runRepo: Repository<PayrollRunEntity>,
    @InjectRepository(PayrollRunEmployeeEntity)
    private readonly runEmpRepo: Repository<PayrollRunEmployeeEntity>,
    @InjectRepository(PayrollRunComponentValueEntity)
    private readonly compValRepo: Repository<PayrollRunComponentValueEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    private readonly attendanceService: AttendanceService,
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
        relations: ['branch'],
      });
      branchName = emp?.branch?.branchName ?? null;
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
      maritalStatus?: string;
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
      'maritalStatus',
    ];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        (emp[key] as string | null | undefined) = body[key] ?? null;
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
           a.date::text AS date,
           a.status,
           a.check_in AS "checkIn",
           a.check_out AS "checkOut",
           a.worked_hours AS "workedHours",
           a.overtime_hours AS "overtimeHours",
           a.short_work_reason AS "shortWorkReason",
           a.remarks,
           a.source,
           a.capture_method AS "captureMethod",
           a.self_marked AS "selfMarked",
           a.check_in_lat AS "checkInLat",
           a.check_in_lng AS "checkInLng",
           a.check_out_lat AS "checkOutLat",
           a.check_out_lng AS "checkOutLng"
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
           a.date::text AS date,
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

  // -- Self Check-In / Check-Out -----------------------------------------------
  async getTodayAttendance(user: EssUser) {
    const empId = this.ensureEmployee(user);
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.ds.query(
      `SELECT id, date::text AS date, status, check_in AS "checkIn", check_out AS "checkOut",
              capture_method AS "captureMethod", self_marked AS "selfMarked",
              check_in_lat AS "checkInLat", check_in_lng AS "checkInLng",
              check_out_lat AS "checkOutLat", check_out_lng AS "checkOutLng"
       FROM attendance_records
       WHERE employee_id = $1 AND date = $2::date`,
      [empId, today],
    );
    return (
      rows[0] || { date: today, status: null, checkIn: null, checkOut: null }
    );
  }

  async selfCheckIn(
    user: EssUser,
    body: {
      captureMethod?: string;
      latitude?: number;
      longitude?: number;
      deviceInfo?: string;
    },
  ) {
    const empId = this.ensureEmployee(user);
    const emp = await this.empRepo.findOne({ where: { id: empId } });
    if (!emp) throw new NotFoundException('Employee not found');

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    // Check if record already exists
    const existing = await this.ds.query(
      `SELECT id, check_in AS "checkIn" FROM attendance_records WHERE employee_id = $1 AND date = $2::date`,
      [empId, today],
    );

    if (existing.length && existing[0].checkIn) {
      throw new BadRequestException(
        'Already checked in today at ' + existing[0].checkIn,
      );
    }

    const method = ['MANUAL', 'BIOMETRIC', 'FACE', 'GEOLOCATION'].includes(
      String(body.captureMethod || '').toUpperCase(),
    )
      ? String(body.captureMethod).toUpperCase()
      : 'MANUAL';

    if (existing.length) {
      // Update existing record (e.g. admin-seeded WEEK_OFF or HOLIDAY shouldn't be overwritten)
      const rec = existing[0];
      await this.ds.query(
        `UPDATE attendance_records
         SET check_in = $1, status = 'PRESENT', capture_method = $2,
             check_in_lat = $3, check_in_lng = $4, device_info = $5,
             self_marked = true, source = 'MANUAL', updated_at = NOW()
         WHERE id = $6`,
        [
          timeStr,
          method,
          body.latitude ?? null,
          body.longitude ?? null,
          body.deviceInfo ?? null,
          rec.id,
        ],
      );
    } else {
      // Create new attendance record
      await this.ds.query(
        `INSERT INTO attendance_records
           (id, client_id, branch_id, employee_id, employee_code, date,
            status, check_in, source, capture_method,
            check_in_lat, check_in_lng, device_info, self_marked)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5,
                 'PRESENT', $6, 'MANUAL', $7, $8, $9, $10, true)`,
        [
          emp.clientId,
          emp.branchId,
          emp.id,
          emp.employeeCode,
          today,
          timeStr,
          method,
          body.latitude ?? null,
          body.longitude ?? null,
          body.deviceInfo ?? null,
        ],
      );
    }

    return {
      success: true,
      date: today,
      checkIn: timeStr,
      captureMethod: method,
    };
  }

  async selfCheckOut(
    user: EssUser,
    body: {
      captureMethod?: string;
      latitude?: number;
      longitude?: number;
      deviceInfo?: string;
    },
  ) {
    const empId = this.ensureEmployee(user);
    const emp = await this.empRepo.findOne({ where: { id: empId } });
    if (!emp) throw new NotFoundException('Employee not found');

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const existing = await this.ds.query(
      `SELECT id, status, check_in AS "checkIn", check_out AS "checkOut"
       FROM attendance_records WHERE employee_id = $1 AND date = $2::date`,
      [empId, today],
    );

    if (!existing.length || !existing[0].checkIn) {
      throw new BadRequestException('Must check in before checking out');
    }
    if (existing[0].checkOut) {
      throw new BadRequestException(
        'Already checked out today at ' + existing[0].checkOut,
      );
    }

    // Calculate worked hours
    const checkInParts = String(existing[0].checkIn).split(':').map(Number);
    const checkInMinutes = checkInParts[0] * 60 + checkInParts[1];
    const checkOutMinutes = now.getHours() * 60 + now.getMinutes();
    const workedDecimal = Math.max(0, (checkOutMinutes - checkInMinutes) / 60);
    const workedHrs = workedDecimal.toFixed(2);
    const STANDARD_HOURS = 9;

    // Determine overtime / short-work
    const excessHrs = Math.max(0, workedDecimal - STANDARD_HOURS);
    const otHours = excessHrs > 0 ? excessHrs.toFixed(2) : '0.00';
    const isShort = workedDecimal < STANDARD_HOURS;
    const dayStatus = existing[0].status; // PRESENT, HOLIDAY, WEEK_OFF, etc.

    // Get employee monthly gross to determine OT vs C/Off
    const salaryInfo = await this.getEmployeeMonthlyGross(empId);
    const monthlyGross = salaryInfo?.monthlyGross ?? 0;
    const OT_THRESHOLD = 21000; // ₹21,000/month

    // Determine overtime_type
    let overtimeType: string | null = null;
    if (excessHrs > 0 || dayStatus === 'HOLIDAY' || dayStatus === 'WEEK_OFF') {
      overtimeType = monthlyGross > OT_THRESHOLD ? 'COFF' : 'OT';
    }

    const method = ['MANUAL', 'BIOMETRIC', 'FACE', 'GEOLOCATION'].includes(
      String(body.captureMethod || '').toUpperCase(),
    )
      ? String(body.captureMethod).toUpperCase()
      : 'MANUAL';

    await this.ds.query(
      `UPDATE attendance_records
       SET check_out = $1, worked_hours = $2, overtime_hours = $3,
           overtime_type = $4,
           check_out_lat = $5, check_out_lng = $6,
           updated_at = NOW()
       WHERE id = $7`,
      [
        timeStr,
        workedHrs,
        otHours,
        overtimeType,
        body.latitude ?? null,
        body.longitude ?? null,
        existing[0].id,
      ],
    );

    // Auto-accrue comp-off for eligible employees
    let coffAccrued = 0;
    if (overtimeType === 'COFF') {
      coffAccrued = await this.accrueCompOff(
        emp,
        existing[0].id,
        today,
        dayStatus,
        excessHrs,
      );
    }

    return {
      success: true,
      date: today,
      checkOut: timeStr,
      workedHours: workedHrs,
      overtimeHours: otHours,
      overtimeType,
      isShortDay: isShort,
      shortWorkReasonRequired: isShort,
      coffAccrued,
      captureMethod: method,
    };
  }

  /** Submit reason for working less than 9 hours */
  async submitShortWorkReason(
    user: EssUser,
    body: { date?: string; reason: string },
  ) {
    const empId = this.ensureEmployee(user);
    const targetDate = body.date || new Date().toISOString().slice(0, 10);
    const reason = (body.reason || '').trim();
    if (!reason || reason.length < 5) {
      throw new BadRequestException(
        'Please provide a valid reason (at least 5 characters)',
      );
    }
    const rows = await this.ds.query(
      `UPDATE attendance_records
       SET short_work_reason = $1, updated_at = NOW()
       WHERE employee_id = $2 AND date = $3::date
       RETURNING id`,
      [reason, empId, targetDate],
    );
    if (!rows.length)
      throw new NotFoundException('Attendance record not found for that date');
    return { success: true, date: targetDate };
  }

  /** Get comp-off balance for an employee */
  async getCompOffBalance(user: EssUser) {
    const empId = this.ensureEmployee(user);
    const rows = await this.ds.query(
      `SELECT
         COALESCE(SUM(CASE WHEN entry_type = 'ACCRUAL' THEN days ELSE 0 END), 0) AS accrued,
         COALESCE(SUM(CASE WHEN entry_type = 'USED' THEN ABS(days) ELSE 0 END), 0) AS used,
         COALESCE(SUM(CASE WHEN entry_type = 'LAPSED' THEN ABS(days) ELSE 0 END), 0) AS lapsed,
         COALESCE(SUM(days), 0) AS available
       FROM comp_off_ledger WHERE employee_id = $1`,
      [empId],
    );
    return {
      accrued: parseFloat(rows[0]?.accrued ?? 0),
      used: parseFloat(rows[0]?.used ?? 0),
      lapsed: parseFloat(rows[0]?.lapsed ?? 0),
      available: parseFloat(rows[0]?.available ?? 0),
    };
  }

  /** Get comp-off ledger history */
  async getCompOffLedger(user: EssUser) {
    const empId = this.ensureEmployee(user);
    return this.ds.query(
      `SELECT id, entry_date AS "entryDate", entry_type AS "entryType",
              days, reason, remarks, created_at AS "createdAt"
       FROM comp_off_ledger WHERE employee_id = $1
       ORDER BY entry_date DESC, created_at DESC LIMIT 50`,
      [empId],
    );
  }

  /** Get overtime summary for a month */
  async getOvertimeSummary(user: EssUser, month?: string) {
    const empId = this.ensureEmployee(user);
    const range = this.resolveMonthRange(month);
    const rows = await this.ds.query(
      `SELECT
         COALESCE(SUM(overtime_hours), 0) AS "totalOtHours",
         COALESCE(SUM(CASE WHEN overtime_type = 'OT' THEN overtime_hours ELSE 0 END), 0) AS "paidOtHours",
         COALESCE(SUM(CASE WHEN overtime_type = 'COFF' THEN overtime_hours ELSE 0 END), 0) AS "coffOtHours",
         COUNT(*) FILTER (WHERE worked_hours < 9 AND status = 'PRESENT') AS "shortDays",
         COUNT(*) FILTER (WHERE worked_hours < 9 AND status = 'PRESENT' AND short_work_reason IS NULL) AS "shortDaysPending",
         COUNT(*) FILTER (WHERE overtime_hours > 0) AS "overtimeDays",
         COUNT(*) FILTER (WHERE status IN ('HOLIDAY','WEEK_OFF') AND check_in IS NOT NULL) AS "workedOnOffDays"
       FROM attendance_records
       WHERE employee_id = $1 AND date >= $2::date AND date < $3::date`,
      [empId, range.startDate, range.endDate],
    );
    const salaryInfo = await this.getEmployeeMonthlyGross(empId);
    return {
      month: range.month,
      monthlyGross: salaryInfo?.monthlyGross ?? 0,
      otEligibility:
        (salaryInfo?.monthlyGross ?? 0) <= 21000 ? 'OT_PAY' : 'COMP_OFF',
      totalOtHours: parseFloat(rows[0]?.totalOtHours ?? 0),
      paidOtHours: parseFloat(rows[0]?.paidOtHours ?? 0),
      coffOtHours: parseFloat(rows[0]?.coffOtHours ?? 0),
      shortDays: parseInt(rows[0]?.shortDays ?? 0, 10),
      shortDaysPending: parseInt(rows[0]?.shortDaysPending ?? 0, 10),
      overtimeDays: parseInt(rows[0]?.overtimeDays ?? 0, 10),
      workedOnOffDays: parseInt(rows[0]?.workedOnOffDays ?? 0, 10),
    };
  }

  // ── Private helpers for OT/C-Off ──────────────────
  private async getEmployeeMonthlyGross(
    empId: string,
  ): Promise<{ monthlyGross: number } | null> {
    const rows = await this.ds.query(
      `SELECT new_ctc FROM employee_salary_revisions
       WHERE employee_id = $1 ORDER BY effective_date DESC LIMIT 1`,
      [empId],
    );
    if (!rows.length) return null;
    const annualCtc = parseFloat(rows[0].new_ctc);
    return { monthlyGross: Math.round(annualCtc / 12) };
  }

  private async accrueCompOff(
    emp: EmployeeEntity,
    attendanceId: string,
    date: string,
    dayStatus: string,
    excessHrs: number,
  ): Promise<number> {
    let days = 0;
    let reason = '';
    let remarks = '';

    if (dayStatus === 'WEEKLY_OFF' || dayStatus === 'WEEK_OFF') {
      // Worked on weekly off → 1 C/Off
      days = 1;
      reason = 'WEEKLY_OFF_WORK';
      remarks = 'Worked on weekly off';
    } else if (dayStatus === 'HOLIDAY') {
      // Worked on holiday → 1 C/Off (or 3x wages — tracked separately)
      days = 1;
      reason = 'HOLIDAY_WORK';
      remarks = 'Worked on holiday';
    } else if (excessHrs >= 9) {
      // 9+ excess hours → floor(excess / 9) C/Off days
      days = Math.floor(excessHrs / 9);
      reason = 'EXCESS_HOURS';
      remarks = `${excessHrs.toFixed(1)} excess hours accumulated`;
    }

    if (days > 0) {
      await this.ds.query(
        `INSERT INTO comp_off_ledger (id, client_id, employee_id, entry_date, entry_type, days, reason, ref_attendance_id, remarks, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3::date, 'ACCRUAL', $4, $5, $6, $7, NOW())`,
        [emp.clientId, emp.id, date, days, reason, attendanceId, remarks],
      );

      // Update leave balance
      await this.ds.query(
        `INSERT INTO leave_balances (id, employee_id, client_id, year, leave_type, opening, accrued, used, lapsed, available, created_at)
         VALUES (gen_random_uuid(), $1, $2, EXTRACT(YEAR FROM $3::date)::int, 'COMP_OFF', 0, $4, 0, 0, $4, NOW())
         ON CONFLICT (employee_id, year, leave_type)
         DO UPDATE SET accrued = leave_balances.accrued + $4,
                       available = leave_balances.available + $4,
                       last_updated_at = NOW()`,
        [emp.id, emp.clientId, date, days],
      );
    }
    return days;
  }

  // -- Employee Document Vault ------------------------------------------------
  async uploadSelfDocument(
    user: EssUser,
    params: {
      docType: string;
      docName: string;
      fileName: string;
      filePath: string;
      fileSize: number;
      mimeType?: string;
      expiryDate?: string;
    },
  ) {
    const empId = this.ensureEmployee(user);
    const emp = await this.empRepo.findOne({ where: { id: empId } });
    if (!emp) throw new NotFoundException('Employee not found');
    await this.ds.query(
      `INSERT INTO employee_documents
         (id, client_id, employee_id, doc_type, doc_name, file_name, file_path,
          file_size, mime_type, uploaded_by_user_id, expiry_date, is_verified,
          created_at, updated_at)
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, now(), now())`,
      [
        emp.clientId,
        emp.id,
        params.docType,
        params.docName || params.fileName,
        params.fileName,
        params.filePath,
        params.fileSize,
        params.mimeType ?? null,
        user.id,
        params.expiryDate ?? null,
      ],
    );
    return { ok: true };
  }

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
    const q = String(opts?.q || '')
      .trim()
      .toLowerCase();

    let items = rows.map((r: DocRow) => ({
      ...r,
      category: this.mapDocCategory(r.docType),
    }));

    if (categoryFilter && categoryFilter !== 'ALL') {
      items = items.filter((r) => r.category === categoryFilter);
    }
    if (yearFilter) {
      items = items.filter((r) => {
        if (!r.createdAt) return false;
        const y = new Date(r.createdAt).getFullYear();
        return y === yearFilter;
      });
    }
    if (q) {
      items = items.filter((r) => {
        const hay =
          `${r.docType || ''} ${r.docName || ''} ${r.fileName || ''}`.toLowerCase();
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

  async createNomination(user: EssUser, dto: CreateEssNominationDto) {
    const empId = this.ensureEmployee(user);
    const emp = await this.empRepo.findOne({ where: { id: empId } });
    if (!emp) throw new NotFoundException('Employee not found');

    if (!dto.nominationType) {
      throw new BadRequestException('nominationType is required');
    }

    // Determine status: save as DRAFT or directly SUBMITTED
    const asDraft = dto.asDraft === true;

    const nom = this.nomRepo.create({
      employeeId: empId,
      clientId: emp.clientId,
      branchId: emp.branchId,
      nominationType:
        dto.nominationType as EmployeeNominationEntity['nominationType'],
      declarationDate: dto.declarationDate || null,
      witnessName: dto.witnessName || null,
      witnessAddress: dto.witnessAddress || null,
      status: asDraft ? 'DRAFT' : 'SUBMITTED',
      submittedAt: asDraft ? null : new Date(),
    });
    const saved = await this.nomRepo.save(nom);

    // Save members
    const members = (dto.members ?? []).filter((m) => m.memberName?.trim());
    if (members.length) {
      const entities = members.map((m) =>
        this.nomMemberRepo.create({
          nominationId: saved.id,
          memberName: m.memberName!.trim(),
          relationship: m.relationship || null,
          dateOfBirth: m.dateOfBirth || null,
          sharePct: m.sharePct ?? 0,
          address: m.address || null,
          isMinor: !!m.isMinor,
          guardianName: m.guardianName || null,
          guardianRelationship: m.guardianRelationship || null,
          guardianAddress: m.guardianAddress || null,
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
  async resubmitNomination(
    user: EssUser,
    nominationId: string,
    dto: ResubmitNominationDto,
  ) {
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
    const members = (dto.members ?? []).filter((m) => m.memberName?.trim());
    if (members.length) {
      await this.nomMemberRepo.delete({ nominationId });
      const entities = members.map((m) =>
        this.nomMemberRepo.create({
          nominationId,
          memberName: m.memberName!.trim(),
          relationship: m.relationship || null,
          dateOfBirth: m.dateOfBirth || null,
          sharePct: m.sharePct ?? 0,
          address: m.address || null,
          isMinor: !!m.isMinor,
          guardianName: m.guardianName || null,
          guardianRelationship: m.guardianRelationship || null,
          guardianAddress: m.guardianAddress || null,
        }),
      );
      await this.nomMemberRepo.save(entities);
    }

    return { ok: true, status: 'SUBMITTED' };
  }

  // Update a DRAFT or APPROVED nomination (e.g., employee married after joining)
  async updateNomination(
    user: EssUser,
    nominationId: string,
    dto: UpdateEssNominationDto,
  ) {
    const empId = this.ensureEmployee(user);
    const nom = await this.nomRepo.findOne({
      where: { id: nominationId, employeeId: empId },
    });
    if (!nom) throw new NotFoundException('Nomination not found');
    if (!['DRAFT', 'APPROVED'].includes(nom.status)) {
      throw new BadRequestException(
        'Only DRAFT or APPROVED nominations can be edited',
      );
    }

    if (dto.declarationDate !== undefined)
      nom.declarationDate = dto.declarationDate || null;
    if (dto.witnessName !== undefined)
      nom.witnessName = dto.witnessName || null;
    if (dto.witnessAddress !== undefined)
      nom.witnessAddress = dto.witnessAddress || null;

    const asDraft = dto.asDraft !== false;
    nom.status = asDraft ? 'DRAFT' : 'SUBMITTED';
    nom.submittedAt = asDraft ? null : new Date();
    if (!asDraft && nom.status === 'APPROVED') {
      nom.approvedAt = null;
      nom.approvedByUserId = null;
    }
    await this.nomRepo.save(nom);

    const members = (dto.members ?? []).filter((m) => m.memberName?.trim());
    if (members.length) {
      await this.nomMemberRepo.delete({ nominationId });
      const entities = members.map((m) =>
        this.nomMemberRepo.create({
          nominationId,
          memberName: m.memberName!.trim(),
          relationship: m.relationship || null,
          dateOfBirth: m.dateOfBirth || null,
          sharePct: m.sharePct ?? 0,
          address: m.address || null,
          isMinor: !!m.isMinor,
          guardianName: m.guardianName || null,
          guardianRelationship: m.guardianRelationship || null,
          guardianAddress: m.guardianAddress || null,
        }),
      );
      await this.nomMemberRepo.save(entities);
    }

    return { ok: true, status: nom.status };
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

  async applyLeave(user: EssUser, dto: ApplyLeaveDto) {
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
    let empMap: Record<string, EmployeeEntity> = {};
    if (empIds.length) {
      const emps = await this.empRepo
        .createQueryBuilder('e')
        .whereInIds(empIds)
        .getMany();
      empMap = Object.fromEntries(emps.map((e) => [e.id, e]));
    }
    const membersMap: Record<string, EmployeeNominationMemberEntity[]> = {};
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
    let empMap: Record<string, EmployeeEntity> = {};
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
  ): Promise<{
    type: 'NOMINATION' | 'LEAVE';
    branchId?: string | null;
    status?: string | null;
    createdAt?: Date | string | null;
    submittedAt?: Date | string | null;
    approvedAt?: Date | string | null;
    appliedAt?: Date | string | null;
    actionedAt?: Date | string | null;
    rejectionReason?: string | null;
    [key: string]: unknown;
  }> {
    if (type === 'NOMINATION') {
      const nom = await this.nomRepo.findOne({ where: { id, clientId } });
      if (!nom) throw new NotFoundException('Approval item not found');
      return { type: 'NOMINATION', ...nom };
    }
    if (type === 'LEAVE') {
      const leave = await this.leaveAppRepo.findOne({
        where: { id, clientId },
      });
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
      at: Date | string | null;
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
    if (item.type === 'NOMINATION')
      return this.rejectNomination(id, userId, reason);
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

  async createLeavePolicy(clientId: string, dto: CreateLeavePolicyDto) {
    if (!dto.leaveType) {
      throw new BadRequestException('leaveType is required');
    }
    if (!dto.leaveName) {
      throw new BadRequestException('leaveName is required');
    }
    const policy = this.leavePolicyRepo.create({
      clientId,
      branchId: dto.branchId || null,
      leaveType: dto.leaveType,
      leaveName: dto.leaveName,
      accrualMethod: dto.accrualMethod || 'MONTHLY',
      accrualRate: String(dto.accrualRate ?? '0'),
      carryForwardLimit: String(dto.carryForwardLimit ?? '0'),
      yearlyLimit: String(dto.yearlyLimit ?? '0'),
      allowNegative: dto.allowNegative ?? false,
      minNoticeDays: dto.minNoticeDays ?? 0,
      maxDaysPerRequest: String(dto.maxDaysPerRequest ?? '0'),
      requiresDocument: dto.requiresDocument ?? false,
      isActive: true,
    });
    return this.leavePolicyRepo.save(policy);
  }

  async updateLeavePolicy(
    clientId: string,
    id: string,
    dto: UpdateLeavePolicyDto,
  ) {
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
        accrualRate: '0.05',
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

  /**
   * Accrue Earned Leave for a given month.
   *
   * Rules:
   *  - Earned Leave (EL) = workedDays / 20  (proportional to actual days worked)
   *  - Paid Leave: from accumulated EL balance, max 1.5 days of leave per month
   *    are paid (deducted from EL balance and added to payable days).
   *  - EL balance accumulates month over month.
   *
   * Flow per employee:
   *  1. Determine paid leave = min(daysOnLeave, 1.5, currentELBalance)
   *  2. Deduct paid leave from EL balance
   *  3. Calculate new EL earned = workedDays / 20
   *  4. Add new EL to balance
   */
  async accrueMonthlyEL(
    clientId: string,
    year: number,
    month: number,
  ): Promise<{
    message: string;
    accrued: number;
    skipped: number;
    alreadyAccrued: number;
    details: Array<{
      employeeId: string;
      workedDays: number;
      daysOnLeave: number;
      paidLeave: number;
      earnedLeave: number;
      newBalance: number;
    }>;
  }> {
    const MAX_PAID_LEAVE_PER_MONTH = 1.5;
    const EL_DIVISOR = 20;
    const LEAVE_TYPE = 'EL';

    // Get attendance summaries for the month
    const summaries = await this.attendanceService.getMonthlySummary({
      clientId,
      year,
      month,
    });

    if (!summaries.length) {
      return {
        message: `No attendance records found for ${year}-${String(month).padStart(2, '0')}`,
        accrued: 0,
        skipped: 0,
        alreadyAccrued: 0,
        details: [],
      };
    }

    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const entryDate = `${monthStr}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`; // last day of month

    let accrued = 0;
    let skipped = 0;
    let alreadyAccrued = 0;
    const details: Array<{
      employeeId: string;
      workedDays: number;
      daysOnLeave: number;
      paidLeave: number;
      earnedLeave: number;
      newBalance: number;
    }> = [];

    for (const summary of summaries) {
      const { employeeId, effectivePresent, daysOnLeave, holidays } = summary;

      // Check if already accrued for this month (prevent double-run)
      const existingLedger = await this.leaveLedgerRepo.findOne({
        where: {
          employeeId,
          leaveType: LEAVE_TYPE,
          refType: 'EL_ACCRUAL',
          remarks: `EL accrual for ${monthStr}`,
        },
      });
      if (existingLedger) {
        alreadyAccrued++;
        continue;
      }

      // workedDays = effective present + holidays (holidays count as worked)
      const workedDays = effectivePresent + holidays;

      // Skip if zero worked days
      if (workedDays <= 0) {
        skipped++;
        continue;
      }

      // Upsert leave balance for the year
      let balance = await this.leaveBalRepo.findOne({
        where: { employeeId, year, leaveType: LEAVE_TYPE },
      });

      if (!balance) {
        balance = this.leaveBalRepo.create({
          employeeId,
          clientId,
          leaveType: LEAVE_TYPE,
          year,
          opening: '0',
          accrued: '0',
          used: '0',
          lapsed: '0',
          available: '0',
        });
      }

      let currentAvailable = parseFloat(balance.available);

      // ── Step 1: Calculate paid leave from EL balance ──────────────
      // Paid leave = min(daysOnLeave, 1.5, currentBalance)
      const paidLeave = Math.min(
        daysOnLeave,
        MAX_PAID_LEAVE_PER_MONTH,
        Math.max(0, currentAvailable),
      );

      // ── Step 2: Deduct paid leave from balance ────────────────────
      if (paidLeave > 0) {
        const newUsed = parseFloat(balance.used) + paidLeave;
        currentAvailable = currentAvailable - paidLeave;
        balance.used = String(Math.round(newUsed * 100) / 100);
        balance.available = String(Math.round(currentAvailable * 100) / 100);

        // Create ledger entry for paid leave deduction
        const paidLeaveLedger = this.leaveLedgerRepo.create({
          employeeId,
          clientId,
          leaveType: LEAVE_TYPE,
          entryDate,
          qty: String(-paidLeave),
          refType: 'EL_PAID_LEAVE',
          refId: null,
          remarks: `Paid leave (${paidLeave} days) for ${monthStr}`,
        });
        await this.leaveLedgerRepo.save(paidLeaveLedger);
      }

      // ── Step 3: Calculate earned leave = workedDays / 20 ─────────
      const earnedLeave = Math.round((workedDays / EL_DIVISOR) * 100) / 100;

      // ── Step 4: Add earned leave to balance ───────────────────────
      const newAccrued = parseFloat(balance.accrued) + earnedLeave;
      currentAvailable = currentAvailable + earnedLeave;
      balance.accrued = String(Math.round(newAccrued * 100) / 100);
      balance.available = String(Math.round(currentAvailable * 100) / 100);
      balance.lastUpdatedAt = new Date();
      await this.leaveBalRepo.save(balance);

      // Create ledger entry for EL accrual
      const accrualLedger = this.leaveLedgerRepo.create({
        employeeId,
        clientId,
        leaveType: LEAVE_TYPE,
        entryDate,
        qty: String(earnedLeave),
        refType: 'EL_ACCRUAL',
        refId: null,
        remarks: `EL accrual for ${monthStr}`,
      });
      await this.leaveLedgerRepo.save(accrualLedger);

      details.push({
        employeeId,
        workedDays,
        daysOnLeave,
        paidLeave,
        earnedLeave,
        newBalance: Math.round(currentAvailable * 100) / 100,
      });

      accrued++;
    }

    return {
      message: `EL accrual completed for ${monthStr}: ${accrued} employees credited`,
      accrued,
      skipped,
      alreadyAccrued,
      details,
    };
  }
}
