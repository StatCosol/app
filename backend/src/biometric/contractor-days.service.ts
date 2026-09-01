import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractorBiometricPunchEntity } from '../mobile-attendance/punch/contractor-punch.entity';

/** Minutes east of UTC used to decide which calendar day a punch belongs to. */
const BUSINESS_TZ_OFFSET_MIN = 330; // IST

export interface ContractorDaysRow {
  contractorEmployeeId: string;
  contractorUserId: string;
  /** HR code — this is what the payroll computation sheet matches on. */
  employeeCode: string | null;
  /** Device User ID — how the punch was attributed, kept for tracing. */
  punchCode: string | null;
  employeeName: string;
  skillCategory: string | null;
  daysWorked: number;
  firstPunch: string;
  lastPunch: string;
}

export interface ContractorDaysSummary {
  from: string;
  to: string;
  rows: ContractorDaysRow[];
  /**
   * Workers with attendance but no `employee_code`. The computation sheet is
   * keyed on that column, so these cannot be matched to a wage line and would
   * silently go unpaid. Surfaced rather than dropped.
   */
  unpayable: ContractorDaysRow[];
}

/**
 * Turns attributed contractor punches into days worked per wage period.
 *
 * Contractor attendance does not live in `attendance_records` and contractor
 * payroll does not read punches — it reads an uploaded muster sheet keyed on
 * `employee_code` with a `days_worked` column. This produces exactly that
 * shape so the punches can feed the existing computation flow.
 *
 * Deliberately a *report*, not an auto-post. Contractor wages are paid from
 * these numbers, punch codes are only unique by convention, and a device that
 * double-counts a shift becomes an overpayment. A human signs the sheet.
 */
@Injectable()
export class ContractorDaysService {
  private readonly logger = new Logger(ContractorDaysService.name);

  constructor(
    @InjectRepository(ContractorBiometricPunchEntity)
    private readonly punchRepo: Repository<ContractorBiometricPunchEntity>,
  ) {}

  /**
   * @param from inclusive business date, `YYYY-MM-DD`
   * @param to   inclusive business date, `YYYY-MM-DD`
   */
  async summarise(
    clientId: string,
    from: string,
    to: string,
    contractorUserId?: string,
  ): Promise<ContractorDaysSummary> {
    const params: unknown[] = [clientId, from, to];
    let contractorFilter = '';
    if (contractorUserId) {
      params.push(contractorUserId);
      contractorFilter = `AND ce.contractor_user_id = $${params.length}`;
    }

    // A day is worked if the person punched at all that day. Counting distinct
    // dates rather than pairing IN/OUT is deliberate: eSSL sends AUTO when the
    // worker does not press the in/out key, which is most of the time, so
    // pairing would silently undercount and underpay.
    const rows = await this.punchRepo.manager.query<ContractorDaysRow[]>(
      `
      SELECT ce.id                                    AS "contractorEmployeeId",
             ce.contractor_user_id                    AS "contractorUserId",
             ce.employee_code                         AS "employeeCode",
             ce.punch_code                            AS "punchCode",
             ce.name                                  AS "employeeName",
             ce.skill_category                        AS "skillCategory",
             COUNT(DISTINCT (p.punch_time + ($4 || ' minutes')::interval)::date)::int
                                                      AS "daysWorked",
             MIN(p.punch_time)                        AS "firstPunch",
             MAX(p.punch_time)                        AS "lastPunch"
        FROM contractor_biometric_punches p
        JOIN contractor_employees ce ON ce.id = p.contractor_employee_id
       WHERE p.client_id = $1
         AND (p.punch_time + ($4 || ' minutes')::interval)::date >= $2::date
         AND (p.punch_time + ($4 || ' minutes')::interval)::date <= $3::date
         -- A punch still awaiting face review is not a worked day yet.
         AND p.decision IN ('AUTO', 'REVIEW_APPROVED')
         ${contractorFilter}
       GROUP BY ce.id, ce.contractor_user_id, ce.employee_code,
                ce.punch_code, ce.name, ce.skill_category
       ORDER BY ce.name
      `,
      [
        ...params.slice(0, 3),
        String(BUSINESS_TZ_OFFSET_MIN),
        ...params.slice(3),
      ],
    );

    const unpayable = rows.filter((r) => !(r.employeeCode || '').trim());
    if (unpayable.length) {
      this.logger.warn(
        `contractor days ${from}..${to}: ${unpayable.length} worker(s) have ` +
          `attendance but no employee_code — they cannot be matched to a wage ` +
          `line and would go unpaid.`,
      );
    }

    return { from, to, rows, unpayable };
  }

  /**
   * The same summary shaped as muster-sheet rows, matching the column names
   * `ContractorComputationService` accepts on upload.
   */
  async asMusterRows(
    clientId: string,
    from: string,
    to: string,
    contractorUserId?: string,
  ): Promise<
    Array<{
      employee_code: string | null;
      employee_name: string;
      skill_category: string | null;
      days_worked: number;
    }>
  > {
    const { rows } = await this.summarise(clientId, from, to, contractorUserId);
    return rows.map((r) => ({
      employee_code: r.employeeCode,
      employee_name: r.employeeName,
      skill_category: r.skillCategory,
      days_worked: r.daysWorked,
    }));
  }
}
