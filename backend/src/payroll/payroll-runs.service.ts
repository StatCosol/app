import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';
import { ClientEntity } from '../clients/entities/client.entity';
import { EmployeeEntity } from '../employees/entities/employee.entity';
import { PayrollClientAssignmentEntity } from './entities/payroll-client-assignment.entity';
import { PayrollInputEntity } from './entities/payroll-input.entity';
import { PayrollRunEmployeeEntity } from './entities/payroll-run-employee.entity';
import { PayrollRunEntity } from './entities/payroll-run.entity';
import { PayrollRunItemEntity } from './entities/payroll-run-item.entity';
import { PayrollPayslipArchiveEntity } from './entities/payroll-payslip-archive.entity';
import { PayrollRunComponentValueEntity } from './entities/payroll-run-component-value.entity';
import { PayrollClientSettings } from './entities/payroll-client-settings.entity';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { PayrollClientScopeService } from './payroll-client-scope.service';
import { LeaveLedgerEntity } from '../ess/entities/leave-ledger.entity';
import { LeaveBalanceEntity } from '../ess/entities/leave-balance.entity';

@Injectable()
export class PayrollRunsService {
  constructor(
    @InjectRepository(PayrollRunEntity)
    private readonly runRepo: Repository<PayrollRunEntity>,
    @InjectRepository(PayrollRunEmployeeEntity)
    private readonly runEmployeeRepo: Repository<PayrollRunEmployeeEntity>,
    @InjectRepository(PayrollClientAssignmentEntity)
    private readonly assignRepo: Repository<PayrollClientAssignmentEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly employeeRepo: Repository<EmployeeEntity>,
    @InjectRepository(PayrollInputEntity)
    private readonly inputRepo: Repository<PayrollInputEntity>,
    @InjectRepository(PayrollClientSettings)
    private readonly clientSettingsRepo: Repository<PayrollClientSettings>,
    @InjectRepository(PayrollPayslipArchiveEntity)
    private readonly payslipArchiveRepo: Repository<PayrollPayslipArchiveEntity>,
    @InjectRepository(LeaveLedgerEntity)
    private readonly leaveLedgerRepo: Repository<LeaveLedgerEntity>,
    @InjectRepository(LeaveBalanceEntity)
    private readonly leaveBalanceRepo: Repository<LeaveBalanceEntity>,
    private readonly scope: PayrollClientScopeService,
  ) {}

  private async getClientAccessToggles(clientId: string) {
    const row = await this.clientSettingsRepo.findOne({ where: { clientId } });
    const s = row?.settings || {};
    return {
      allowBranchPayrollAccess: s.allowBranchPayrollAccess === true,
    };
  }

  private async ensureClientPayrollAccess(user: ReqUser) {
    const isClient =
      !!user?.id && user?.roleCode === 'CLIENT' && !!user?.clientId;
    if (!isClient) {
      throw new BadRequestException(
        'Only client users can access this resource',
      );
    }
    if (user.userType === 'BRANCH') {
      const toggles = await this.getClientAccessToggles(user.clientId!);
      if (!toggles.allowBranchPayrollAccess) {
        throw new ForbiddenException(
          'Payroll access has not been enabled for branch users',
        );
      }
    }
  }

  async clientListPayrollRuns(user: ReqUser, q: Record<string, any>) {
    await this.ensureClientPayrollAccess(user);
    const qb = this.runRepo
      .createQueryBuilder('r')
      .where('r.client_id = :cid', { cid: user.clientId })
      .orderBy('r.created_at', 'DESC');

    if (user.userType === 'BRANCH' && user.branchIds?.length) {
      qb.andWhere('(r.branch_id IN (:...ubids) OR r.branch_id IS NULL)', {
        ubids: user.branchIds,
      });
    } else if (q?.branchId) {
      qb.andWhere('r.branch_id = :bid', { bid: q.branchId });
    }
    if (q?.periodYear)
      qb.andWhere('r.period_year = :y', { y: Number(q.periodYear) });
    if (q?.periodMonth)
      qb.andWhere('r.period_month = :m', { m: Number(q.periodMonth) });
    if (q?.status) qb.andWhere('r.status = :s', { s: q.status });

    const runs = await qb.getMany();
    if (!runs.length) return [];

    const runIds = runs.map((r) => r.id);
    const empCounts = await this.runEmployeeRepo
      .createQueryBuilder('e')
      .select('e.run_id', 'runId')
      .addSelect('COUNT(1)', 'cnt')
      .where('e.run_id IN (:...runIds)', { runIds })
      .groupBy('e.run_id')
      .getRawMany<{ runId: string; cnt: string }>();
    const cntMap = new Map<string, number>();
    for (const c of empCounts) cntMap.set(c.runId, Number(c.cnt || 0));

    return runs.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      branchId: r.branchId ?? null,
      periodYear: r.periodYear,
      periodMonth: r.periodMonth,
      title: r.title ?? `Payroll Run`,
      status: r.status,
      createdAt: r.createdAt,
      employeeCount: cntMap.get(r.id) ?? 0,
      type: 'RUN' as const,
    }));
  }


  async createPayrollRun(user: ReqUser, dto: CreatePayrollRunDto) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user?.roleCode !== 'PAYROLL' && user?.roleCode !== 'ADMIN') {
      throw new ForbiddenException('Only payroll/admin allowed');
    }
    if (!dto?.clientId || !dto?.periodYear || !dto?.periodMonth) {
      throw new BadRequestException(
        'clientId, periodYear, periodMonth are required',
      );
    }
    const periodMonth = Number(dto.periodMonth);
    if (periodMonth < 1 || periodMonth > 12) {
      throw new BadRequestException('periodMonth must be 1..12');
    }
    await this.scope.assertPayrollAccessToClient(user, dto.clientId);

    const existing = await this.runRepo.findOne({
      where: {
        clientId: dto.clientId,
        periodYear: Number(dto.periodYear),
        periodMonth: periodMonth,
      },
    });
    if (existing) {
      throw new BadRequestException(
        'Payroll run already exists for this client and period',
      );
    }

    let title = dto?.title?.trim() || null;
    if (dto?.sourcePayrollInputId) {
      const input = await this.inputRepo.findOne({
        where: { id: dto.sourcePayrollInputId },
      });
      if (!input)
        throw new BadRequestException('Source payroll input not found');
      if (input.clientId !== dto.clientId)
        throw new BadRequestException('Source input client mismatch');
      if (!title) title = input.title;
    }

    const row = this.runRepo.create({
      clientId: dto.clientId,
      branchId: dto.branchId ?? null,
      periodYear: Number(dto.periodYear),
      periodMonth: periodMonth,
      status: 'DRAFT',
      sourcePayrollInputId: dto.sourcePayrollInputId ?? null,
      title,
    });
    const savedRun = await this.runRepo.save(row);

    // ── Auto-seed employees from master employee list ──────────────────
    const whereClause: Record<string, any> = {
      clientId: dto.clientId,
      isActive: true,
    };
    if (dto.branchId) {
      whereClause.branchId = dto.branchId;
    }
    const masterEmployees = await this.employeeRepo.find({
      where: whereClause,
      order: { employeeCode: 'ASC' },
    });

    if (masterEmployees.length) {
      const seedEntities = masterEmployees.map((emp) =>
        this.runEmployeeRepo.create({
          runId: savedRun.id,
          clientId: savedRun.clientId,
          branchId: emp.branchId ?? savedRun.branchId ?? null,
          employeeId: emp.id,
          employeeCode: emp.employeeCode,
          employeeName: emp.name,
          designation: emp.designation ?? null,
          uan: emp.uan ?? null,
          esic: emp.esic ?? null,
          stateCode: emp.stateCode ?? null,
        }),
      );

      await this.runEmployeeRepo.save(seedEntities);
    }

    return {
      ...savedRun,
      employeeCount: masterEmployees.length,
    };
  }

  async deleteDraftPayrollRun(user: ReqUser, runId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (user?.roleCode !== 'PAYROLL' && user?.roleCode !== 'ADMIN') {
      throw new ForbiddenException('Only payroll/admin allowed');
    }

    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');

    await this.scope.assertPayrollAccessToClient(user, run.clientId);

    const status = String(run.status || '').toUpperCase();
    if (status === 'APPROVED') {
      throw new BadRequestException(
        `Cannot delete run in "${status}" state. Approved runs are locked.`,
      );
    }

    await this.runRepo.manager.transaction(async (manager) => {
      await manager.delete(PayrollRunComponentValueEntity, { runId });
      await manager.delete(PayrollRunItemEntity, { runId });
      await manager.delete(PayrollPayslipArchiveEntity, { runId });
      await manager.delete(PayrollRunEmployeeEntity, { runId });
      await manager.delete(PayrollRunEntity, { id: runId });
    });

    return { deleted: true, runId };
  }

  async listPayrollRuns(user: ReqUser, q: Record<string, any>) {
    if (!user?.id) throw new BadRequestException('Invalid user');

    // Determine allowed clientIds
    let allowedClientIds: string[] = [];
    if (['ADMIN', 'CRM', 'CEO', 'CCO'].includes(user.roleCode)) {
      const all = await this.clientRepo
        .createQueryBuilder('c')
        .select('c.id', 'id')
        .where('c.is_deleted = false')
        .getRawMany<{ id: string }>();
      allowedClientIds = all.map((r) => r.id);
    } else {
      const assigned = await this.assignRepo
        .createQueryBuilder('a')
        .select('a.client_id', 'clientId')
        .where('a.payroll_user_id = :uid', { uid: user.id })
        .andWhere('a.status = :s', { s: 'ACTIVE' })
        .andWhere('a.end_date IS NULL')
        .getRawMany<{ clientId: string }>();
      allowedClientIds = assigned.map((r) => r.clientId);
    }
    if (!allowedClientIds.length) return [];

    const qb = this.runRepo
      .createQueryBuilder('r')
      .innerJoin(ClientEntity, 'c', 'c.id = r.client_id')
      .select('r.id', 'id')
      .addSelect('r.client_id', 'clientId')
      .addSelect('c.client_name', 'clientName')
      .addSelect('r.period_year', 'periodYear')
      .addSelect('r.period_month', 'periodMonth')
      .addSelect('r.status', 'status')
      .addSelect('r.created_at', 'createdAt')
      .addSelect('r.submitted_at', 'submittedAt')
      .addSelect('r.approved_at', 'approvedAt')
      .addSelect('r.rejected_at', 'rejectedAt')
      .addSelect('r.rejection_reason', 'rejectionReason')
      .addSelect('r.approval_comments', 'approvalComments')
      .where('r.client_id IN (:...ids)', { ids: allowedClientIds })
      .andWhere('c.is_deleted = false')
      .orderBy('r.created_at', 'DESC');

    if (q?.clientId) qb.andWhere('r.client_id = :cid', { cid: q.clientId });
    if (q?.periodYear)
      qb.andWhere('r.period_year = :y', { y: Number(q.periodYear) });
    if (q?.periodMonth)
      qb.andWhere('r.period_month = :m', { m: Number(q.periodMonth) });
    if (q?.status) qb.andWhere('r.status = :st', { st: q.status });

    interface PayrollRunRaw {
      id: string;
      clientId: string;
      clientName: string | null;
      periodYear: string;
      periodMonth: string;
      status: string | null;
      createdAt: string | null;
      submittedAt: string | null;
      approvedAt: string | null;
      rejectedAt: string | null;
      rejectionReason: string | null;
      approvalComments: string | null;
    }
    const rows = await qb.getRawMany<PayrollRunRaw>();

    // employeeCount (batched)
    const runIds = rows.map((r) => r.id).filter(Boolean);
    let counts: { runId: string; cnt: string }[] = [];
    if (runIds.length) {
      counts = await this.runEmployeeRepo
        .createQueryBuilder('e')
        .select('e.run_id', 'runId')
        .addSelect('COUNT(1)', 'cnt')
        .where('e.run_id IN (:...runIds)', { runIds })
        .groupBy('e.run_id')
        .getRawMany();
    }
    const mapCnt = new Map(counts.map((c) => [c.runId, Number(c.cnt || 0)]));
    return rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      clientName: r.clientName ?? null,
      periodYear: Number(r.periodYear),
      periodMonth: Number(r.periodMonth),
      status: r.status ?? 'DRAFT',
      employeeCount: mapCnt.get(r.id) ?? 0,
      createdAt: r.createdAt ?? null,
      submittedAt: r.submittedAt ?? null,
      approvedAt: r.approvedAt ?? null,
      rejectedAt: r.rejectedAt ?? null,
      rejectionReason: r.rejectionReason ?? null,
      approvalComments: r.approvalComments ?? null,
    }));
  }

  /**
   * List employees for a payroll run.
   * NOTE: Frontend uses `employeeId` as a path param later; we return employeeCode there.
   */

  async processPayrollRun(user: ReqUser, runId: string) {
    if (!user?.id) throw new BadRequestException('Invalid user');

    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');

    await this.scope.assertPayrollAccessToClient(user, run.clientId);

    const currentStatus = String(run.status || '').toUpperCase();
    if (
      currentStatus !== 'DRAFT' &&
      currentStatus !== 'REJECTED' &&
      currentStatus !== 'IN_PROGRESS'
    ) {
      throw new BadRequestException(
        `Payroll run is "${currentStatus}". Only DRAFT, REJECTED, or IN_PROGRESS runs can be processed.`,
      );
    }

    const employeeCount = await this.runEmployeeRepo.count({
      where: { runId },
    });
    if (employeeCount <= 0) {
      throw new BadRequestException(
        'No employees found in this run. Import attendance/input before processing.',
      );
    }

    run.status = 'PROCESSED';
    // Reset workflow metadata for a fresh cycle.
    run.submittedByUserId = null;
    run.submittedAt = null;
    run.approvedByUserId = null;
    run.approvedAt = null;
    run.approvalComments = null;
    run.rejectedByUserId = null;
    run.rejectedAt = null;
    run.rejectionReason = null;

    return this.runRepo.save(run);
  }


  async seedMarchEl(runId: string) {
    const { MARCH_2026_SHEET_DATA } = await import('./march-2026-el-data');

    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');

    const year = run.periodYear;
    const month = run.periodMonth;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const entryDate = `${monthStr}-01`;

    // Get all employees in this run
    const runEmps = await this.runEmployeeRepo.find({ where: { runId } });

    const results: {
      empCode: string;
      action: string;
      elAccrued?: number;
      paidLeave?: number;
      balance?: number;
    }[] = [];

    for (const re of runEmps) {
      const empCode = re.employeeCode;
      const sheetRow = MARCH_2026_SHEET_DATA[empCode];
      if (!sheetRow) {
        results.push({ empCode, action: 'SKIP_NOT_IN_SHEET' });
        continue;
      }

      // Look up master employee for DOJ
      const masterEmp = re.employeeId
        ? await this.employeeRepo.findOne({ where: { id: re.employeeId } })
        : null;

      // Skip employees who joined in the same month as the payroll run
      if (masterEmp?.dateOfJoining) {
        const doj = new Date(masterEmp.dateOfJoining);
        if (doj.getFullYear() === year && doj.getMonth() + 1 === month) {
          results.push({ empCode, action: 'SKIP_MARCH_JOINER' });
          continue;
        }
      }

      const elAccrued = Math.round((sheetRow.workDays / 20) * 100) / 100;
      const paidLeave = sheetRow.paidLeave;

      if (!re.employeeId) {
        results.push({ empCode, action: 'SKIP_NO_EMPLOYEE_ID' });
        continue;
      }

      // Delete existing EL ledger entries for this month (idempotent)
      await this.leaveLedgerRepo
        .createQueryBuilder()
        .delete()
        .where('employee_id = :empId', { empId: re.employeeId })
        .andWhere('leave_type = :lt', { lt: 'EL' })
        .andWhere('remarks LIKE :m', { m: `%${monthStr}%` })
        .execute();

      // Ledger: EL accrual (credit)
      if (elAccrued > 0) {
        await this.leaveLedgerRepo.save(
          this.leaveLedgerRepo.create({
            employeeId: re.employeeId,
            clientId: run.clientId,
            leaveType: 'EL',
            entryDate,
            qty: String(elAccrued),
            refType: 'EL_ACCRUAL',
            refId: run.id,
            remarks: `EL accrual for ${monthStr}: ${elAccrued} days`,
          }),
        );
      }

      // Ledger: EL paid leave (debit)
      if (paidLeave > 0) {
        await this.leaveLedgerRepo.save(
          this.leaveLedgerRepo.create({
            employeeId: re.employeeId,
            clientId: run.clientId,
            leaveType: 'EL',
            entryDate,
            qty: String(-paidLeave),
            refType: 'EL_PAID_LEAVE',
            refId: run.id,
            remarks: `EL paid leave for ${monthStr}: ${paidLeave} days`,
          }),
        );
      }

      // Upsert leave_balances
      await this.leaveBalanceRepo.query(
        `INSERT INTO leave_balances (id, employee_id, client_id, year, leave_type, opening, accrued, used, lapsed, available, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'EL', 0, $4, $5, 0, $6, NOW())
         ON CONFLICT (employee_id, year, leave_type)
         DO UPDATE SET accrued   = COALESCE((
                         SELECT SUM(ABS(qty)) FROM leave_ledger
                         WHERE employee_id = $1 AND leave_type = 'EL' AND ref_type = 'EL_ACCRUAL'
                           AND EXTRACT(YEAR FROM entry_date::date) = $3
                       ), 0),
                       used      = COALESCE((
                         SELECT SUM(ABS(qty)) FROM leave_ledger
                         WHERE employee_id = $1 AND leave_type = 'EL' AND ref_type = 'EL_PAID_LEAVE'
                           AND EXTRACT(YEAR FROM entry_date::date) = $3
                       ), 0),
                       available = GREATEST(leave_balances.opening
                         + COALESCE((
                             SELECT SUM(ABS(qty)) FROM leave_ledger
                             WHERE employee_id = $1 AND leave_type = 'EL' AND ref_type = 'EL_ACCRUAL'
                               AND EXTRACT(YEAR FROM entry_date::date) = $3
                           ), 0)
                         - COALESCE((
                             SELECT SUM(ABS(qty)) FROM leave_ledger
                             WHERE employee_id = $1 AND leave_type = 'EL' AND ref_type = 'EL_PAID_LEAVE'
                               AND EXTRACT(YEAR FROM entry_date::date) = $3
                           ), 0), 0),
                       last_updated_at = NOW()`,
        [
          re.employeeId,
          run.clientId,
          year,
          elAccrued,
          paidLeave,
          Math.max(elAccrued - paidLeave, 0),
        ],
      );

      const balance = Math.max(
        Math.round((elAccrued - paidLeave) * 100) / 100,
        0,
      );
      results.push({
        empCode,
        action: 'SEEDED',
        elAccrued,
        paidLeave,
        balance,
      });
    }

    return { runId, month: monthStr, results };
  }

  /** One-time: remove employees from a run that are not in the March paysheet */
  async removeNotInSheet(runId: string) {
    const { MARCH_2026_SHEET_DATA } = await import('./march-2026-el-data');

    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new BadRequestException('Payroll run not found');

    const runEmps = await this.runEmployeeRepo.find({ where: { runId } });
    const removed: string[] = [];

    for (const re of runEmps) {
      if (!MARCH_2026_SHEET_DATA[re.employeeCode]) {
        // Delete archive record
        await this.payslipArchiveRepo.delete({
          runId,
          employeeCode: re.employeeCode,
        });
        // Delete component values
        const cvRepo = this.runEmployeeRepo.manager.getRepository(
          PayrollRunComponentValueEntity,
        );
        await cvRepo.delete({ runId, runEmployeeId: re.id });
        // Delete from run employees
        await this.runEmployeeRepo.delete({ id: re.id });
        removed.push(re.employeeCode);
      }
    }

    return { runId, removed };
  }
}
