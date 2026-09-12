import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';
import { ServiceEntitlementsService } from '../service-entitlements/service-entitlements.service';
import { ServiceModuleCode } from '../service-entitlements/service-entitlements.constants';
import { MonthlyCloseQueryDto } from './monthly-close.dto';
import {
  CloseArea,
  CloseIssue,
  CloseStage,
  closeStage,
} from './monthly-close.types';

@Injectable()
export class MonthlyCloseService {
  private readonly logger = new Logger(MonthlyCloseService.name);

  constructor(
    private readonly db: DataSource,
    private readonly access: AccessScopeService,
    private readonly entitlements: ServiceEntitlementsService,
  ) {}

  async get(user: ReqUser, query: MonthlyCloseQueryDto) {
    const { clientId, branchId, month } = query;
    await this.access.assertClientAllowed(user, clientId);
    // listAllowedBranches validates both membership in the client and user scope.
    const branches = await this.access.listAllowedBranches(user, clientId);
    const branch = branches.find((b) => b.id === branchId);
    if (!branch)
      throw new ForbiddenException('Branch not available for this client');
    const entitlement = await this.entitlements.getCurrentForClient(clientId);
    const enabled = (code: ServiceModuleCode) =>
      entitlement.enabledModules.includes(code);
    const stages: CloseStage[] = [];
    const run = async (
      area: CloseArea,
      title: string,
      work: () => Promise<CloseStage>,
    ) => {
      try {
        stages.push(await work());
      } catch (error) {
        this.logger.error(
          `Monthly close ${area} unavailable`,
          error instanceof Error ? error.stack : undefined,
        );
        stages.push({
          area,
          title,
          state: 'UNAVAILABLE',
          total: 0,
          outstanding: 0,
          description:
            'This check could not be loaded. Retry before making a closing decision.',
          issues: [],
          truncated: false,
        });
      }
    };
    // Only query and return modules included in this client's service package.
    if (enabled('EMPLOYEE_ATTENDANCE')) {
      await run('attendance', 'Attendance', () => this.attendance(query));
    }
    if (enabled('PAYROLL')) {
      await run('payroll', 'Payroll approval', async () => {
        if (user.userType === 'BRANCH') {
          const rows = await this.db.query(
            'SELECT settings FROM payroll_client_settings WHERE client_id = $1',
            [clientId],
          );
          const settings = rows[0]?.settings ?? {};
          if (
            settings.allowBranchPayrollAccess !== true ||
            (settings.payrollBranchScope === 'SELECTED' &&
              !(
                Array.isArray(settings.payrollAllowedBranchIds) &&
                settings.payrollAllowedBranchIds.includes(branchId)
              ))
          ) {
            return {
              area: 'payroll',
              title: 'Payroll approval',
              state: 'UNAVAILABLE',
              total: 0,
              outstanding: 0,
              description:
                'Payroll visibility is restricted by your company settings.',
              issues: [],
              truncated: false,
            };
          }
        }
        return this.payroll(query);
      });
    }
    if (enabled('CONTRACTOR_DOCUMENTS')) {
      await run('documents', 'Contractor evidence', () =>
        this.documents(query),
      );
    }
    if (enabled('EMPLOYEE_COMPLIANCE')) {
      await run('returns', 'Returns and filing evidence', () =>
        this.returns(query),
      );
    }
    return {
      clientId,
      branchId,
      branchName: branch.branchName,
      month,
      generatedAt: new Date().toISOString(),
      stages,
      outstanding: stages.reduce((sum, stage) => sum + stage.outstanding, 0),
      needsVerification:
        stages.some(
          (stage) => stage.state === 'UNKNOWN' || stage.state === 'UNAVAILABLE',
        ) || !stages.length,
      note: 'Live review of recorded branch data. Clear checks do not close the month, certify compliance, or confirm payment. Company-wide payroll runs and returns are outside this branch view.',
    };
  }

  private values(q: MonthlyCloseQueryDto) {
    return [q.clientId, q.branchId, `${q.month}-01`];
  }

  private async attendance(q: MonthlyCloseQueryDto) {
    const values = this.values(q);
    const [counts] = await this.db.query(
      `SELECT count(*)::int AS total,
      count(*) FILTER (WHERE approval_status IS DISTINCT FROM 'APPROVED')::int AS pending
      FROM attendance_records WHERE client_id = $1 AND branch_id = $2
      AND date >= $3::date AND date < $3::date + interval '1 month'`,
      values,
    );
    const [mismatches] = await this.db.query(
      `SELECT count(*)::int AS total FROM attendance_mismatches
      WHERE client_id = $1 AND branch_id = $2 AND date >= $3::date
      AND date < $3::date + interval '1 month' AND resolved = false`,
      values,
    );
    const issues: CloseIssue[] = [];
    if (counts.pending)
      issues.push({
        id: 'attendance-approval',
        sourceId: null,
        title: 'Attendance awaiting approval or correction',
        reason: `${counts.pending} recorded entries are not approved.`,
        owner: 'Attendance reviewer',
        dueDate: null,
      });
    if (mismatches.total)
      issues.push({
        id: 'attendance-mismatch',
        sourceId: null,
        title: 'Unresolved attendance mismatches',
        reason: `${mismatches.total} mismatch records need a resolution. These may overlap with unapproved entries.`,
        owner: 'Attendance reviewer',
        dueDate: null,
      });
    const stage = closeStage(
      'attendance',
      'Attendance',
      counts.total,
      Number(counts.pending) + Number(mismatches.total),
      'Checks recorded attendance approvals and unresolved mismatches. Missing days and offline punches are not inferred from an empty queue.',
      issues,
    );
    // These are aggregate actions, not a truncated employee list.
    stage.truncated = false;
    return stage;
  }

  private async payroll(q: MonthlyCloseQueryDto) {
    const rows = await this.db.query(
      `SELECT id, status FROM payroll_runs
      WHERE client_id = $1 AND branch_id = $2 AND period_year = EXTRACT(YEAR FROM $3::date)
      AND period_month = EXTRACT(MONTH FROM $3::date) ORDER BY created_at DESC`,
      this.values(q),
    );
    const issues = rows
      .filter((r: { status: string }) => r.status !== 'APPROVED')
      .map((r: { id: string; status: string }) => ({
        id: r.id,
        sourceId: r.id,
        title: 'Payroll run needs approval',
        reason: `Current status: ${r.status}.`,
        owner: 'Payroll team and approver',
        dueDate: null,
      }));
    return closeStage(
      'payroll',
      'Payroll approval',
      rows.length,
      issues.length,
      'Approval status of branch-specific runs. An approved run is not evidence of salary payment.',
      issues,
    );
  }

  private async documents(q: MonthlyCloseQueryDto) {
    // Expand company-wide requirements per assigned contractor/branch. A branch
    // override (including is_required=false) takes precedence over the default.
    const rows = await this.db.query(
      `WITH requirements AS (
      SELECT DISTINCT ON (bc.contractor_user_id, rd.doc_type)
        COALESCE(rd.id, bc.contractor_user_id) AS id, bc.contractor_user_id,
        COALESCE(rd.doc_type, 'Configure document requirements') AS doc_type,
        COALESCE(rd.is_required, true) AS is_required, rd.id IS NOT NULL AS configured,
        COALESCE(u.name, 'Contractor') AS contractor_name
      FROM branch_contractor bc
      LEFT JOIN contractor_required_documents rd ON rd.client_id = bc.client_id
        AND rd.contractor_user_id = bc.contractor_user_id
        AND (rd.branch_id = bc.branch_id OR rd.branch_id IS NULL)
      LEFT JOIN users u ON u.id = bc.contractor_user_id
      WHERE bc.client_id = $1 AND bc.branch_id = $2
      ORDER BY bc.contractor_user_id, rd.doc_type, rd.branch_id NULLS LAST, rd.updated_at DESC, rd.id
    ), checked AS (
      SELECT r.*, d.id AS document_id, d.status,
        CASE WHEN r.configured = false THEN 'UNCONFIGURED'
          WHEN d.id IS NULL THEN 'MISSING'
          WHEN NULLIF(BTRIM(d.file_path), '') IS NULL THEN 'FILE_MISSING'
          WHEN d.expiry_date < ($3::date + interval '1 month' - interval '1 day')::date THEN 'EXPIRED_IN_PERIOD'
          WHEN d.status IS DISTINCT FROM 'APPROVED' THEN 'NEEDS_REVIEW'
          ELSE 'RECORDED_CLEAR' END AS check_state
      FROM requirements r
      LEFT JOIN LATERAL (
        SELECT cd.id, cd.status, cd.file_path, cd.expiry_date FROM contractor_documents cd
        WHERE cd.client_id = $1 AND cd.branch_id = $2 AND cd.contractor_user_id = r.contractor_user_id
          AND cd.doc_type = r.doc_type AND cd.doc_month = to_char($3::date, 'YYYY-MM')
        ORDER BY cd.created_at DESC, cd.id DESC LIMIT 1
      ) d ON true WHERE r.is_required = true
    ) SELECT *, count(*) OVER()::int AS total,
      count(*) FILTER (WHERE check_state <> 'RECORDED_CLEAR') OVER()::int AS outstanding
      FROM checked ORDER BY (check_state = 'RECORDED_CLEAR'), contractor_name, doc_type LIMIT 100`,
      this.values(q),
    );
    const messages: Record<string, string> = {
      UNCONFIGURED:
        'This assigned contractor has no document requirements configured. Confirm requirements before reviewing completeness.',
      MISSING: 'No submission for this required document and reporting month.',
      FILE_MISSING: 'The latest submission has no recorded file.',
      EXPIRED_IN_PERIOD:
        'The latest document expires before the end of the reporting month.',
      NEEDS_REVIEW:
        'The latest submission has not been approved. Earlier approvals do not approve a replacement.',
    };
    const issues: CloseIssue[] = rows
      .filter(
        (r: { check_state: string }) => r.check_state !== 'RECORDED_CLEAR',
      )
      .map(
        (r: {
          id: string;
          document_id: string | null;
          doc_type: string;
          contractor_name: string;
          check_state: string;
        }) => ({
          id: `${r.id}:${q.branchId}`,
          sourceId: r.document_id,
          title: `${r.contractor_name} — ${r.doc_type}`,
          reason: messages[r.check_state] ?? 'Review this submission.',
          owner: 'Contractor and document reviewer',
          dueDate: null,
        }),
      );
    return closeStage(
      'documents',
      'Contractor evidence',
      Number(rows[0]?.total ?? 0),
      Number(rows[0]?.outstanding ?? 0),
      'Reconciles configured document requirements against the latest submission for this month. Checks file references, expiry and approval; it does not read wage amounts or verify document contents. Missing configuration requires review; no assigned requirements means coverage is unknown.',
      issues,
    );
  }

  private async returns(q: MonthlyCloseQueryDto) {
    const rows = await this.db.query(
      `WITH checked AS (
      SELECT id, return_type, status, due_date::text, crm_owner,
        CASE WHEN status = 'NOT_APPLICABLE' THEN NULL
          WHEN status IS DISTINCT FROM 'APPROVED' THEN 'Return requires filing or approval.'
          WHEN NULLIF(BTRIM(ack_file_path), '') IS NULL THEN 'Approved return has no recorded acknowledgment file.'
          WHEN filed_date IS NULL THEN 'Approved return has no filing date.' ELSE NULL END AS reason
      FROM compliance_returns WHERE client_id = $1 AND branch_id = $2 AND is_deleted = false
        AND ((period_year = EXTRACT(YEAR FROM $3::date) AND period_month = EXTRACT(MONTH FROM $3::date))
          OR (period_month IS NULL AND due_date >= $3::date AND due_date < $3::date + interval '1 month'))
    ) SELECT *, count(*) OVER()::int AS total,
      count(*) FILTER (WHERE reason IS NOT NULL) OVER()::int AS outstanding
      FROM checked ORDER BY (reason IS NULL), due_date NULLS LAST, id LIMIT 100`,
      this.values(q),
    );
    const issues: CloseIssue[] = rows
      .filter((r: { reason: string | null }) => r.reason)
      .map(
        (r: {
          id: string;
          return_type: string;
          reason: string;
          crm_owner: string | null;
          due_date: string | null;
        }) => ({
          id: r.id,
          sourceId: r.id,
          title: r.return_type,
          reason: r.reason,
          owner: r.crm_owner || 'Compliance team',
          dueDate: r.due_date,
        }),
      );
    return closeStage(
      'returns',
      'Returns and filing evidence',
      Number(rows[0]?.total ?? 0),
      Number(rows[0]?.outstanding ?? 0),
      'Checks returns recorded for this month and non-monthly returns due within it. An acknowledgment reference is not independent verification of a filing.',
      issues,
    );
  }
}
