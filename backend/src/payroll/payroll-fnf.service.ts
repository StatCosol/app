import * as fs from 'fs';
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
import { LeaveBalanceEntity } from '../ess/entities/leave-balance.entity';
import { CreateFnfDto, UpdateFnfStatusDto } from './dto/payroll-fnf.dto';
import { PayrollFnfDocumentEntity } from './entities/payroll-fnf-document.entity';
import { PayrollFnfEntity } from './entities/payroll-fnf.entity';
import { PayrollFnfEventEntity } from './entities/payroll-fnf-event.entity';
import { PayrollRunEmployeeEntity } from './entities/payroll-run-employee.entity';
import { evaluateFormula } from './engine/expression';
import { PayrollClientScopeService } from './payroll-client-scope.service';

@Injectable()
export class PayrollFnfService {
  constructor(
    @InjectRepository(PayrollFnfEntity)
    private readonly fnfRepo: Repository<PayrollFnfEntity>,
    @InjectRepository(PayrollFnfEventEntity)
    private readonly fnfEventRepo: Repository<PayrollFnfEventEntity>,
    @InjectRepository(PayrollFnfDocumentEntity)
    private readonly fnfDocRepo: Repository<PayrollFnfDocumentEntity>,
    @InjectRepository(ClientEntity)
    private readonly clientRepo: Repository<ClientEntity>,
    @InjectRepository(EmployeeEntity)
    private readonly employeeRepo: Repository<EmployeeEntity>,
    @InjectRepository(LeaveBalanceEntity)
    private readonly leaveBalanceRepo: Repository<LeaveBalanceEntity>,
    @InjectRepository(PayrollRunEmployeeEntity)
    private readonly runEmployeeRepo: Repository<PayrollRunEmployeeEntity>,
    private readonly scope: PayrollClientScopeService,
  ) {}

  private readonly FNF_ALLOWED_TRANSITIONS: Record<string, string[]> = {
    INITIATED: ['UNDER_REVIEW', 'APPROVED'],
    UNDER_REVIEW: ['APPROVED', 'SETTLED'],
    APPROVED: ['SETTLED', 'DOCS_ISSUED'],
    SETTLED: ['DOCS_ISSUED', 'COMPLETED'],
    DOCS_ISSUED: ['COMPLETED'],
    COMPLETED: [],
  };

  async listFnf(user: ReqUser, q: Record<string, any>) {
    const clientIds = await this.scope.getAssignedClientIds(user);
    if (!clientIds.length) return { data: [], total: 0 };

    const qb = this.fnfRepo
      .createQueryBuilder('f')
      .leftJoin('clients', 'c', 'c.id = f.client_id')
      .leftJoin('employees', 'e', 'e.id = f.employee_id')
      .select([
        'f.id as "id"',
        'f.separation_date as "separationDate"',
        'f.last_working_day as "lastWorkingDay"',
        'f.reason as "reason"',
        'f.status as "status"',
        'f.settlement_amount as "settlementAmount"',
        'f.created_at as "createdAt"',
        'f.client_id as "clientId"',
        'c.client_name as "clientName"',
        'f.employee_id as "employeeId"',
        'e.name as "employeeName"',
        'e.employee_code as "employeeCode"',
      ])
      .where('f.client_id IN (:...ids)', { ids: clientIds });

    if (q?.status) qb.andWhere('f.status = :st', { st: q.status });
    if (q?.clientId) qb.andWhere('f.client_id = :cid', { cid: q.clientId });
    if (q?.search) {
      qb.andWhere('(e.name ILIKE :s OR e.employee_code ILIKE :s)', {
        s: `%${q.search}%`,
      });
    }

    const total = await qb.getCount();
    qb.orderBy('f.created_at', 'DESC');
    const page = Math.max(1, Number(q?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q?.limit) || 25));
    qb.skip((page - 1) * limit).take(limit);
    const data = await qb.getRawMany();
    return { data, total, page, limit };
  }

  async createFnf(user: ReqUser, dto: CreateFnfDto) {
    const clientIds = await this.scope.getAssignedClientIds(user);
    if (!dto.clientId || !clientIds.includes(dto.clientId)) {
      throw new ForbiddenException('Invalid client');
    }
    if (!dto.employeeId) {
      throw new BadRequestException('employeeId is required');
    }

    const employee = await this.employeeRepo.findOne({
      where: { id: dto.employeeId },
    });
    if (!employee || employee.clientId !== dto.clientId) {
      throw new BadRequestException(
        'Employee does not belong to selected client',
      );
    }

    const fnf = this.fnfRepo.create({
      clientId: dto.clientId,
      employeeId: dto.employeeId,
      separationDate: dto.separationDate,
      lastWorkingDay: dto.lastWorkingDay || null,
      reason: dto.reason || null,
      status: 'INITIATED',
      checklist: dto.checklist || [],
      settlementBreakup: dto.settlementBreakup || null,
      remarks: dto.remarks || null,
      initiatedBy: user.id,
    });
    const saved = await this.fnfRepo.save(fnf);

    await this.fnfEventRepo.save(
      this.fnfEventRepo.create({
        fnfId: saved.id,
        statusFrom: null,
        statusTo: 'INITIATED',
        action: 'INITIATED',
        remarks: saved.remarks || null,
        performedBy: user.id || null,
        metadata: {
          separationDate: saved.separationDate,
          lastWorkingDay: saved.lastWorkingDay,
        },
      }),
    );

    return saved;
  }

  async updateFnfStatus(user: ReqUser, fnfId: string, dto: UpdateFnfStatusDto) {
    const fnf = await this.fnfRepo.findOne({ where: { id: fnfId } });
    if (!fnf) throw new BadRequestException('F&F not found');
    await this.scope.assertPayrollAccessToClient(user, fnf.clientId);
    if (!dto?.status) throw new BadRequestException('status is required');

    const fromStatus = this.normalizeFnfStatus(fnf.status);
    const toStatus = this.normalizeFnfStatus(dto.status);

    if (fromStatus === toStatus) {
      throw new BadRequestException(`Case is already in ${toStatus} status`);
    }

    const allowedNext = this.FNF_ALLOWED_TRANSITIONS[fromStatus] || [];
    if (!allowedNext.includes(toStatus)) {
      throw new BadRequestException(
        `Invalid F&F transition from ${fromStatus} to ${toStatus}`,
      );
    }

    const update: Partial<
      Pick<
        PayrollFnfEntity,
        | 'status'
        | 'remarks'
        | 'checklist'
        | 'settlementBreakup'
        | 'approvedBy'
        | 'settlementAmount'
      >
    > = { status: toStatus };

    if (dto.remarks !== undefined) {
      update.remarks = String(dto.remarks || '').trim() || null;
    }
    if (dto.checklist !== undefined) {
      if (!Array.isArray(dto.checklist)) {
        throw new BadRequestException('checklist must be an array');
      }
      update.checklist = dto.checklist;
    }
    if (dto.settlementBreakup !== undefined) {
      update.settlementBreakup = dto.settlementBreakup ?? null;
    }

    if (toStatus === 'APPROVED') {
      update.approvedBy = user.id;
    }

    if (toStatus === 'SETTLED') {
      const settlementAmount = Number(dto.settlementAmount);
      if (!Number.isFinite(settlementAmount) || settlementAmount <= 0) {
        throw new BadRequestException(
          'settlementAmount must be a positive number for SETTLED status',
        );
      }
      update.settlementAmount = settlementAmount;
    }

    if (toStatus === 'COMPLETED') {
      const amount = Number(fnf.settlementAmount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException(
          'Cannot complete F&F case before settlement amount is captured',
        );
      }
    }

    await this.fnfRepo.update(fnfId, update);

    await this.fnfEventRepo.save(
      this.fnfEventRepo.create({
        fnfId,
        statusFrom: fromStatus,
        statusTo: toStatus,
        action: 'STATUS_UPDATE',
        remarks: update.remarks ?? fnf.remarks ?? null,
        settlementAmount:
          update.settlementAmount !== undefined &&
          update.settlementAmount !== null
            ? String(update.settlementAmount)
            : null,
        performedBy: user?.id || null,
        metadata: {
          checklistUpdated: dto.checklist !== undefined,
          hasSettlementBreakup: dto.settlementBreakup !== undefined,
        },
      }),
    );

    return { success: true, status: toStatus };
  }

  async saveFnfBreakup(
    user: ReqUser,
    fnfId: string,
    body: {
      settlementBreakup: Record<string, number>;
      manualOverride?: boolean;
      remarks?: string;
    },
  ) {
    const fnf = await this.fnfRepo.findOne({ where: { id: fnfId } });
    if (!fnf) throw new BadRequestException('F&F not found');
    await this.scope.assertPayrollAccessToClient(user, fnf.clientId);

    const net =
      Number(body.settlementBreakup?.pendingSalary || 0) +
      Number(body.settlementBreakup?.leaveEncashment || 0) +
      Number(body.settlementBreakup?.bonusArrears || 0) -
      Number(body.settlementBreakup?.deductions || 0) -
      Number(body.settlementBreakup?.recoveries || 0);

    await this.fnfRepo.update(fnfId, {
      settlementBreakup: body.settlementBreakup,
      settlementAmount: net,
      manualOverride: body.manualOverride ?? fnf.manualOverride,
      remarks: body.remarks ?? fnf.remarks,
    });
    return { ok: true, settlementAmount: net };
  }

  async getFnfDetail(user: ReqUser, fnfId: string) {
    const fnf = await this.fnfRepo.findOne({ where: { id: fnfId } });
    if (!fnf) throw new BadRequestException('F&F not found');
    await this.scope.assertPayrollAccessToClient(user, fnf.clientId, {
      allowReadOnly: true,
    });

    const emp = await this.employeeRepo.findOne({
      where: { id: fnf.employeeId },
    });
    const client = await this.clientRepo.findOne({
      where: { id: fnf.clientId },
    });
    const history = await this.fnfEventRepo.find({
      where: { fnfId },
      order: { createdAt: 'ASC' },
    });

    // ── Auto-computed settlement breakup (suggested) ──
    // Pending Salary  = monthly_gross prorated to LWD-day-of-month
    // Leave Encash    = available EL × (monthly_gross / 30)
    // Other lines default 0; user can override on the UI before settling.
    const computedBreakup = await this.computeFnfBreakup(fnf, emp);

    return {
      ...fnf,
      employeeName: emp ? emp.name : 'Unknown',
      employeeCode: emp?.employeeCode || '',
      clientName: client?.clientName || 'Unknown',
      computedBreakup,
      history: history.map((event) => ({
        id: event.id,
        statusFrom: event.statusFrom,
        statusTo: event.statusTo,
        action: event.action,
        remarks: event.remarks,
        settlementAmount:
          event.settlementAmount !== null &&
          event.settlementAmount !== undefined
            ? Number(event.settlementAmount)
            : null,
        performedBy: event.performedBy,
        createdAt: event.createdAt,
      })),
    };
  }

  private async computeFnfBreakup(
    fnf: PayrollFnfEntity,
    emp: EmployeeEntity | null,
  ): Promise<{
    pendingSalary: number;
    leaveEncashment: number;
    bonusArrears: number;
    deductions: number;
    recoveries: number;
    notes: string[];
  }> {
    const notes: string[] = [];
    const monthlyGross = Number(emp?.monthlyGross || 0);
    if (!monthlyGross)
      notes.push(
        'Employee monthly_gross missing — pending salary and leave encashment defaulted to 0.',
      );

    // Pending salary — prorated to LWD day-of-month within the separation month.
    let pendingSalary = 0;
    const lwdStr = (fnf.lastWorkingDay ||
      fnf.separationDate ||
      '') as unknown as string;
    if (lwdStr && monthlyGross > 0) {
      const lwd = new Date(lwdStr);
      if (!isNaN(lwd.getTime())) {
        const daysInMonth = new Date(
          lwd.getUTCFullYear(),
          lwd.getUTCMonth() + 1,
          0,
        ).getDate();
        const dayOfMonth = lwd.getUTCDate();
        pendingSalary = Math.round((monthlyGross * dayOfMonth) / daysInMonth);
        const monthName = lwd.toLocaleString('en-IN', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        });
        notes.push(
          `Pending salary = monthly_gross (₹${monthlyGross}) × ${dayOfMonth}/${daysInMonth} days of ${monthName} (separation month).`,
        );
      }
    }

    // Leave encashment — Gross/26 × min(total available EL, 20).
    // Look up the employee's EL balance for the exit year first; if not found,
    // sum all years (accumulated carry-forward) to avoid showing 0 for exited employees.
    let leaveEncashment = 0;
    if (emp?.id && monthlyGross > 0) {
      try {
        const exitYear = lwdStr
          ? new Date(lwdStr).getUTCFullYear()
          : new Date().getFullYear();

        // Try exit year first, then fall back to summing all available EL across years
        const balRows: Array<{ total: string }> =
          await this.leaveBalanceRepo.query(
            `SELECT COALESCE(SUM(available::numeric), 0)::text AS total
             FROM leave_balances
            WHERE employee_id = $1
              AND leave_type = 'EL'
              AND available::numeric > 0
              AND year <= $2`,
            [emp.id, exitYear],
          );
        const avail = balRows.length ? parseFloat(balRows[0].total) || 0 : 0;
        const ENCASH_CAP = 20;
        const encashable = Math.min(avail, ENCASH_CAP);
        if (encashable > 0) {
          const perDay = monthlyGross / 26;
          leaveEncashment = Math.round(encashable * perDay);
          const capNote =
            avail > ENCASH_CAP
              ? ` (capped at ${ENCASH_CAP} of ${avail.toFixed(2)} available)`
              : '';
          notes.push(
            `Leave encashment = ${encashable} EL${capNote} × ₹${perDay.toFixed(2)} per day (monthly_gross/26).`,
          );
        } else {
          notes.push(
            'Leave encashment = 0 (no EL balance available up to exit year).',
          );
        }
      } catch {
        /* ignore */
      }
    }

    // Statutory bonus — 8.33% × Basic / 26 × days worked in current FY (Apr–Mar).
    let bonusArrears = 0;
    if (emp?.id) {
      try {
        // FY based on LWD month: months 1-3 belong to previous FY (Apr Y-1 – Mar Y).
        const ref = lwdStr ? new Date(lwdStr) : new Date();
        if (!isNaN(ref.getTime())) {
          const refMonth = ref.getUTCMonth() + 1; // 1–12
          const refYear = ref.getUTCFullYear();
          const fyStartYear = refMonth >= 4 ? refYear : refYear - 1;
          const fyEndYear = fyStartYear + 1;

          // Latest BASIC component value seen for this employee on or before LWD;
          // fall back to monthly_gross × 50% if no payroll history exists.
          const basicRows: Array<{ amount: string }> =
            await this.runEmployeeRepo.manager.query(
              `SELECT cv.amount::text AS amount
                 FROM payroll_run_component_values cv
                 JOIN payroll_run_employees re ON re.id = cv.run_employee_id
                 JOIN payroll_runs pr ON pr.id = re.run_id
                WHERE re.employee_id = $1
                  AND upper(cv.component_code) = 'BASIC'
                ORDER BY pr.period_year DESC, pr.period_month DESC
                LIMIT 1`,
              [emp.id],
            );
          let basic = basicRows.length ? Number(basicRows[0].amount) || 0 : 0;
          if (basic > 0) {
            notes.push(
              `Basic ₹${basic} taken from latest payroll BASIC component.`,
            );
          }
          // If no payroll history, derive BASIC from the client's active salary
          // structure (client-defined rule). This honours per-client formulas
          // such as LMSPL: Basic = Gross if Gross<=15000, 15000 if 15000<Gross<=30000,
          // else 50% of Gross.
          if (!basic && monthlyGross > 0 && emp?.clientId) {
            try {
              const rows: Array<{
                formula: string | null;
                calc_method: string;
                fixed_amount: string | null;
                percentage: string | null;
                percentage_base: string | null;
              }> = await this.runEmployeeRepo.manager.query(
                `SELECT i.formula, i.calc_method, i.fixed_amount::text, i.percentage::text, i.percentage_base
                     FROM pay_salary_structure_items i
                     JOIN pay_salary_structures s ON s.id = i.structure_id
                     JOIN payroll_components c ON c.id = i.component_id
                    WHERE s.client_id = $1
                      AND s.is_active = true
                      AND i.enabled = true
                      AND upper(c.code) = 'BASIC'
                    ORDER BY s.effective_from DESC NULLS LAST
                    LIMIT 1`,
                [emp.clientId],
              );
              if (rows.length) {
                const item = rows[0];
                if (item.calc_method === 'FORMULA' && item.formula) {
                  basic = Math.round(
                    evaluateFormula(item.formula, {
                      vars: {
                        ACTUAL_GROSS: monthlyGross,
                        GROSS: monthlyGross,
                        WORKED_DAYS: 26,
                      },
                      param: () => 0,
                      earningsSum: () => monthlyGross,
                    }),
                  );
                  notes.push(
                    `Basic ₹${basic} computed from client salary-structure formula: ${item.formula}.`,
                  );
                } else if (item.calc_method === 'FIXED' && item.fixed_amount) {
                  basic = Math.round(Number(item.fixed_amount) || 0);
                  notes.push(`Basic ₹${basic} from client structure (fixed).`);
                } else if (
                  item.calc_method === 'PERCENTAGE' &&
                  item.percentage
                ) {
                  basic = Math.round(
                    ((Number(item.percentage) || 0) * monthlyGross) / 100,
                  );
                  notes.push(
                    `Basic ₹${basic} from client structure (${item.percentage}% of gross).`,
                  );
                }
              }
            } catch (err) {
              notes.push(
                `Basic structure lookup failed (${(err as Error).message}); using fallback.`,
              );
            }
          }
          if (!basic && monthlyGross > 0) {
            basic = Math.round(monthlyGross * 0.5);
            notes.push(
              `Basic not found in payroll history or client structure — assumed 50% of monthly_gross = ₹${basic}.`,
            );
          }

          // Sum of WORKED_DAYS for runs whose period falls inside this FY.
          const wdRows: Array<{ total: string | null }> =
            await this.runEmployeeRepo.manager.query(
              `SELECT COALESCE(SUM(cv.amount), 0)::text AS total
                 FROM payroll_run_component_values cv
                 JOIN payroll_run_employees re ON re.id = cv.run_employee_id
                 JOIN payroll_runs pr ON pr.id = re.run_id
                WHERE re.employee_id = $1
                  AND upper(cv.component_code) = 'WORKED_DAYS'
                  AND (
                    (pr.period_year = $2 AND pr.period_month >= 4)
                    OR (pr.period_year = $3 AND pr.period_month <= 3)
                  )`,
              [emp.id, fyStartYear, fyEndYear],
            );
          const workedDaysFy = wdRows.length ? Number(wdRows[0].total) || 0 : 0;

          if (basic > 0 && workedDaysFy > 0) {
            bonusArrears = Math.round(((0.0833 * basic) / 26) * workedDaysFy);
            notes.push(
              `Statutory bonus = 8.33% × Basic (₹${basic}) / 26 × ${workedDaysFy} days worked in FY ${fyStartYear}-${String(fyEndYear).slice(-2)}.`,
            );
          } else if (workedDaysFy <= 0) {
            notes.push(
              `Bonus = 0 (no WORKED_DAYS recorded for FY ${fyStartYear}-${String(fyEndYear).slice(-2)}).`,
            );
          }
        }
      } catch {
        /* ignore */
      }
    }

    return {
      pendingSalary,
      leaveEncashment,
      bonusArrears,
      deductions: 0,
      recoveries: 0,
      notes,
    };
  }

  private normalizeFnfStatus(input: string): string {
    const normalized = String(input || '')
      .trim()
      .toUpperCase();
    if (!normalized) return 'INITIATED';
    return normalized;
  }

  // ====================
  // F&F DOCUMENTS
  // ====================

  async uploadFnfDocument(
    user: ReqUser,
    fnfId: string,
    file: {
      fileName: string;
      filePath: string;
      fileSize: number;
      mimeType?: string;
    },
    docType: string,
    docName: string,
    remarks?: string,
  ) {
    const fnf = await this.fnfRepo.findOne({ where: { id: fnfId } });
    if (!fnf) throw new BadRequestException('F&F case not found');
    await this.scope.assertPayrollAccessToClient(user, fnf.clientId, {
      allowReadOnly: true,
    });

    const doc = this.fnfDocRepo.create({
      fnfId,
      clientId: fnf.clientId,
      employeeId: fnf.employeeId,
      docType,
      docName,
      fileName: file.fileName,
      filePath: file.filePath,
      fileSize: file.fileSize,
      mimeType: file.mimeType ?? null,
      uploadedBy: user.userId || user.id,
      remarks: remarks || null,
    });
    return this.fnfDocRepo.save(doc);
  }

  async listFnfDocuments(user: ReqUser, fnfId: string) {
    const fnf = await this.fnfRepo.findOne({ where: { id: fnfId } });
    if (!fnf) throw new BadRequestException('F&F case not found');
    await this.scope.assertPayrollAccessToClient(user, fnf.clientId, {
      allowReadOnly: true,
    });

    return this.fnfDocRepo.find({
      where: { fnfId },
      order: { createdAt: 'DESC' },
    });
  }

  async getFnfDocument(user: ReqUser, docId: string) {
    const doc = await this.fnfDocRepo.findOne({ where: { id: docId } });
    if (!doc) throw new BadRequestException('Document not found');
    await this.scope.assertPayrollAccessToClient(user, doc.clientId, {
      allowReadOnly: true,
    });
    return doc;
  }

  async deleteFnfDocument(user: ReqUser, docId: string) {
    const doc = await this.fnfDocRepo.findOne({ where: { id: docId } });
    if (!doc) throw new BadRequestException('Document not found');
    await this.scope.assertPayrollAccessToClient(user, doc.clientId);
    // Remove physical file if it exists
    if (fs.existsSync(doc.filePath)) {
      fs.unlinkSync(doc.filePath);
    }
    await this.fnfDocRepo.remove(doc);
    return { deleted: true };
  }

  /**
   * Generate a settlement document PDF on-the-fly from F&F case data.
   * Uses saved settlementBreakup if present, otherwise falls back to the
   * auto-computed suggestion. Returns buffer + suggested filename for the
   * controller to stream as a download.
   */
  async generateFnfDocumentPdf(
    user: ReqUser,
    fnfId: string,
    docType: string,
    _override?: {
      pendingSalary?: number;
      leaveEncashment?: number;
      bonusArrears?: number;
      deductions?: number;
      recoveries?: number;
      settlementAmount?: number;
    },
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    // PD-H2: ignore caller-supplied override values entirely. The PDF must
    // reflect the persisted F&F record (settlementBreakup / settlementAmount)
    // so that what is downloaded equals what was approved by Payroll.
    const override: {
      pendingSalary?: number;
      leaveEncashment?: number;
      bonusArrears?: number;
      deductions?: number;
      recoveries?: number;
      settlementAmount?: number;
    } = {};
    void _override;
    const fnf = await this.fnfRepo.findOne({ where: { id: fnfId } });
    if (!fnf) throw new BadRequestException('F&F case not found');
    await this.scope.assertPayrollAccessToClient(user, fnf.clientId, {
      allowReadOnly: true,
    });

    const allowed = [
      'SETTLEMENT_STATEMENT',
      'RELIEVING_LETTER',
      'EXPERIENCE_CERTIFICATE',
      'NO_DUES_CERTIFICATE',
    ];
    const dt = String(docType || '').toUpperCase();
    if (!allowed.includes(dt)) {
      throw new BadRequestException(
        'Unsupported docType. Allowed: ' + allowed.join(', '),
      );
    }

    const emp = await this.employeeRepo.findOne({
      where: { id: fnf.employeeId },
    });
    const client = await this.clientRepo.findOne({
      where: { id: fnf.clientId },
    });

    const computed = await this.computeFnfBreakup(fnf, emp);
    const saved = (fnf.settlementBreakup as Record<string, unknown>) || {};
    const hasSaved = Object.values(saved).some((v) => Number(v as number) > 0);
    const hasOverride =
      !!override &&
      [
        override.pendingSalary,
        override.leaveEncashment,
        override.bonusArrears,
        override.deductions,
        override.recoveries,
      ].some((v) => v !== undefined && v !== null);
    const pick = (
      key:
        | 'pendingSalary'
        | 'leaveEncashment'
        | 'bonusArrears'
        | 'deductions'
        | 'recoveries',
    ): number => {
      // Priority: explicit user override > saved breakup > computed.
      if (hasOverride) {
        const v = (override as Record<string, number | undefined>)[key];
        if (v !== undefined && v !== null) return Number(v) || 0;
      }
      if (hasSaved && saved[key] !== undefined && saved[key] !== null) {
        return Number(saved[key] as number) || 0;
      }
      return Number((computed as unknown as Record<string, number>)[key] || 0);
    };
    const breakup = {
      pendingSalary: pick('pendingSalary'),
      leaveEncashment: pick('leaveEncashment'),
      bonusArrears: pick('bonusArrears'),
      deductions: pick('deductions'),
      recoveries: pick('recoveries'),
    };

    const computedNet =
      breakup.pendingSalary +
      breakup.leaveEncashment +
      breakup.bonusArrears -
      breakup.deductions -
      breakup.recoveries;
    const netAmount =
      override?.settlementAmount !== undefined &&
      override?.settlementAmount !== null
        ? Number(override.settlementAmount) || 0
        : fnf.settlementAmount !== null && fnf.settlementAmount !== undefined
          ? Number(fnf.settlementAmount)
          : computedNet;

    const { generateFnfPdfBuffer } = await import('./utils/fnf-pdf');
    const buffer = await generateFnfPdfBuffer({
      docType: dt as
        | 'SETTLEMENT_STATEMENT'
        | 'RELIEVING_LETTER'
        | 'EXPERIENCE_CERTIFICATE'
        | 'NO_DUES_CERTIFICATE',
      client: {
        name: client?.clientName || 'Company',
        address: client?.registeredAddress || null,
        logoUrl: client?.logoUrl || null,
      },
      employee: {
        name: emp?.name || 'Employee',
        employeeCode: emp?.employeeCode || '-',
        designation: emp?.designation || null,
        department: emp?.department || null,
        fatherName: emp?.fatherName || null,
        dateOfJoining: emp?.dateOfJoining || null,
        pan: emp?.pan || null,
        uan: emp?.uan || null,
      },
      separation: {
        separationDate: fnf.separationDate,
        lastWorkingDay: fnf.lastWorkingDay,
        reason: fnf.reason,
      },
      settlement: { ...breakup, netAmount },
      issueDate: new Date().toISOString().slice(0, 10),
      remarks: fnf.remarks,
    });

    const safeName = (emp?.name || 'employee')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const filename = `${dt}_${safeName}_${emp?.employeeCode || ''}.pdf`;
    return { buffer, filename, mimeType: 'application/pdf' };
  }
}
