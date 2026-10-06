import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { ReqUser } from '../access/access-scope.service';
import { BranchAccessService } from '../auth/branch-access.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ComplianceDocumentsService } from '../compliance-documents/compliance-documents.service';
import { ClientPayrollDocumentsService } from '../payroll/client-payroll-documents.service';
import { ServiceEntitlementsService } from '../service-entitlements/service-entitlements.service';
import { operationalDate } from '../common/operational-date';
import { LegitxScopeService } from './legitx-scope.service';
import { AssistantDocumentDto } from './dto/assistant-document.dto';
import { documentIntent } from './assistant-document-intent';
import { AuditsService } from '../audits/audits.service';
import { FilesService } from '../files/files.service';
import { resolveStoredUploadPath } from '../common/stored-upload-path';

export interface Match {
  id: string;
  kind:
    | 'EMPLOYEE'
    | 'LIBRARY'
    | 'PAYSLIP'
    | 'FNF'
    | 'CONTRACTOR'
    | 'AUDIT_EVIDENCE'
    | 'REGISTRATION'
    | 'RETURN';
  title: string;
  branchId: string | null;
  owner: string | null;
  period: string | null;
  status: string;
  employeeCode?: string;
  contractorId?: string;
  nonComplianceId?: string;
  variant?: string;
}

@Injectable()
export class LegitxAssistantDocumentsService {
  constructor(
    private readonly scopeService: LegitxScopeService,
    private readonly library: ComplianceDocumentsService,
    private readonly payroll: ClientPayrollDocumentsService,
    private readonly branches: BranchAccessService,
    private readonly audit: AuditLogsService,
    private readonly db: DataSource,
    private readonly entitlements: ServiceEntitlementsService,
    private readonly audits: AuditsService,
    private readonly files: FilesService,
  ) {}

  private async context(
    user: ReqUser,
    query: { branchId?: string; clientId?: string },
  ) {
    if (!['CLIENT', 'BRANCH_DESK'].includes(user.roleCode) || !user.clientId)
      throw new ForbiddenException(
        'Document access is unavailable for this account.',
      );
    const scope = await this.scopeService.resolve(user, query);
    if (scope.clientId !== user.clientId)
      throw new ForbiddenException('Company not in scope');
    await this.entitlements.assertModule(scope.clientId, 'EMPLOYEE_COMPLIANCE');
    const master =
      user.roleCode === 'CLIENT' &&
      user.userType === 'MASTER' &&
      scope.allowedBranchIds === 'ALL' &&
      (await this.branches.isMasterUser(user.id));
    return { scope, master };
  }

  private allowedBranch(
    scope: Awaited<ReturnType<LegitxScopeService['resolve']>>,
    branchId: string | null,
  ) {
    return (
      (!scope.branchId || scope.branchId === branchId) &&
      (scope.allowedBranchIds === 'ALL' ||
        (!!branchId && scope.allowedBranchIds.includes(branchId)))
    );
  }

  async find(user: ReqUser, query: AssistantDocumentDto) {
    const { scope, master } = await this.context(user, query);
    const intent = documentIntent(query.request);
    const response = (
      status: string,
      message: string,
      documents: Match[] = [],
    ) => ({
      status,
      message,
      documents,
      sourceLabel: 'Recorded data',
      readOnly: true,
      coverage:
        'Stored employee, published payroll, compliance library, contractor documents and published audit NC resubmission files. Missing required contractor documents and auditor draft attachments are not included.',
    });
    if (
      !intent ||
      (query.contractorId && intent.kind !== 'CONTRACTOR') ||
      (query.nonComplianceId && intent.kind !== 'AUDIT_EVIDENCE')
    )
      return response(
        'UNSUPPORTED',
        'This read-only request is not supported yet. Use the relevant document workspace. Try an employee appointment letter or payslip, PF challan, bonus register, branch registration or audit report.',
      );
    // No field-level grant exists for Assist yet: sensitive categories require company master authority.
    if (!master && (intent.kind !== 'LIBRARY' || intent.category !== 'LICENSE'))
      return response(
        'UNAVAILABLE',
        'This document is unavailable in your current permissions. Ask your company administrator to review access.',
      );
    if (
      intent.kind === 'PAYSLIP' ||
      intent.kind === 'FNF' ||
      intent.category === 'REGISTER' ||
      intent.category === 'RETURN'
    )
      await this.entitlements.assertModule(scope.clientId, 'PAYROLL');
    if (intent.category === 'AUDIT_REPORT')
      await this.entitlements.assertModule(scope.clientId, 'CONTRACTOR_AUDIT');
    if (intent.kind === 'CONTRACTOR')
      await this.entitlements.assertModule(
        scope.clientId,
        'CONTRACTOR_DOCUMENTS',
      );
    if (intent.kind === 'AUDIT_EVIDENCE')
      await this.entitlements.assertModule(scope.clientId, 'CONTRACTOR_AUDIT');
    if (intent.branchName) {
      const rows = await this.db.query(
        'SELECT id FROM client_branches WHERE clientid = $1 AND lower(branchname) = lower($2) AND isdeleted = false',
        [scope.clientId, intent.branchName],
      );
      const allowed = rows.filter((row: { id: string }) =>
        this.allowedBranch(scope, row.id),
      );
      if (allowed.length !== 1)
        return response(
          'UNAVAILABLE',
          'Select an allowed branch in the dashboard filter and try again.',
        );
      scope.branchId = allowed[0].id;
    }
    const [currentYear, currentMonth] = operationalDate()
      .split('-')
      .map(Number);
    let month = intent.month ?? query.month ?? currentMonth;
    let year = intent.year ?? query.year ?? currentYear;
    if (/\blast month\b/i.test(query.request)) {
      month = currentMonth === 1 ? 12 : currentMonth - 1;
      year = currentMonth === 1 ? currentYear - 1 : currentYear;
    }
    let matches: Match[] = [];
    let ambiguousEmployee = false;
    if (intent.kind === 'CONTRACTOR') {
      const contractors = await this.db.query(
        `SELECT DISTINCT u.id, bc.branch_id FROM users u JOIN branch_contractor bc ON bc.contractor_user_id = u.id
         WHERE bc.client_id = $1 AND lower(u.name) = lower($2) AND u.deleted_at IS NULL
           AND ($3::uuid IS NULL OR u.id = $3) AND ($4::uuid IS NULL OR bc.branch_id = $4)`,
        [
          scope.clientId,
          intent.contractorName,
          query.contractorId || null,
          scope.branchId,
        ],
      );
      const contractorIds = new Set(
        contractors
          .filter((row: any) => this.allowedBranch(scope, row.branch_id))
          .map((row: any) => row.id),
      );
      if (!contractorIds.size)
        return response(
          'UNAVAILABLE',
          'No available document matched within your permissions and selected context.',
        );
      ambiguousEmployee = contractorIds.size > 1;
      const rows = await this.db.query(
        `SELECT d.id, d.title, d.branch_id, d.doc_month, d.status, u.name, u.user_code, u.id AS contractor_id
         FROM contractor_documents d JOIN users u ON u.id = d.contractor_user_id
         JOIN branch_contractor bc ON bc.contractor_user_id = u.id AND bc.branch_id = d.branch_id AND bc.client_id = d.client_id
         WHERE d.client_id = $1 AND lower(u.name) = lower($2) AND u.deleted_at IS NULL
           AND ($3::uuid IS NULL OR u.id = $3) AND ($4::uuid IS NULL OR d.branch_id = $4)
           AND (d.doc_month IS NULL OR d.doc_month = $5)
           AND ($6::boolean = false OR d.status IN ('UPLOADED', 'PENDING_REVIEW'))
           AND d.file_path IS NOT NULL AND d.file_path <> '' ORDER BY d.created_at DESC`,
        [
          scope.clientId,
          intent.contractorName,
          query.contractorId || null,
          scope.branchId,
          `${year}-${String(month).padStart(2, '0')}`,
          !!intent.pending,
        ],
      );
      matches = rows
        .filter(
          (doc: any) =>
            this.allowedBranch(scope, doc.branch_id) &&
            contractorIds.has(doc.contractor_id),
        )
        .map((doc: any) => ({
          id: doc.id,
          kind: 'CONTRACTOR',
          title: doc.title,
          branchId: doc.branch_id,
          owner: `${doc.name} (${doc.user_code})`,
          contractorId: doc.contractor_id,
          period: doc.doc_month,
          status: doc.status,
        }));
    } else if (intent.kind === 'AUDIT_EVIDENCE') {
      if (
        intent.nonComplianceId &&
        query.nonComplianceId &&
        intent.nonComplianceId !== query.nonComplianceId.toLowerCase()
      )
        return response(
          'UNAVAILABLE',
          'The requested non-compliance does not match the selected context.',
        );
      const nonComplianceId = intent.nonComplianceId || query.nonComplianceId;
      if (!nonComplianceId)
        return response(
          'CONTEXT_REQUIRED',
          'Include the non-compliance ID from the audit workspace, for example: Show evidence for NC followed by its ID.',
        );
      const rows = await this.db.query(
        `SELECT rs.id, rs.file_name, rs.resubmitted_at, nc.status, nc.id AS nc_id, a.id AS audit_id, a.branch_id, a.audit_code
         FROM audit_resubmissions rs JOIN audit_non_compliances nc ON nc.id = rs.non_compliance_id AND nc.audit_id = rs.audit_id
         JOIN audits a ON a.id = nc.audit_id WHERE a.client_id = $1 AND nc.id = $2
           AND a.preliminary_published_at IS NOT NULL AND nc.published_at IS NOT NULL
           AND rs.file_path IS NOT NULL AND rs.file_path <> '' ORDER BY rs.resubmitted_at DESC`,
        [scope.clientId, nonComplianceId],
      );
      const visibleAudits = new Map<string, Set<string>>();
      for (const doc of rows) {
        if (!this.allowedBranch(scope, doc.branch_id)) continue;
        if (!visibleAudits.has(doc.audit_id)) {
          const visible = await this.audits.listNcsForVendor(
            user,
            doc.audit_id,
          );
          visibleAudits.set(
            doc.audit_id,
            new Set(visible.items.map((nc: any) => nc.id)),
          );
        }
        if (!visibleAudits.get(doc.audit_id)!.has(doc.nc_id)) continue;
        matches.push({
          id: doc.id,
          kind: 'AUDIT_EVIDENCE',
          title: doc.file_name || 'Stored NC evidence',
          branchId: doc.branch_id,
          owner: doc.audit_code || 'Published audit',
          period: String(doc.resubmitted_at),
          status: doc.status,
          nonComplianceId: doc.nc_id,
        });
      }
    } else if (intent.kind === 'LIBRARY') {
      const rows = await this.library.listForClient(scope.clientId!, user.id, {
        category: intent.category,
        subCategory: intent.subCategory,
        branchId: scope.branchId || undefined,
        ...(intent.category !== 'LICENSE'
          ? { periodMonth: month, periodYear: year }
          : {}),
      });
      matches = rows
        .filter(
          (doc) =>
            this.allowedBranch(scope, doc.branchId) &&
            (!/\bchallan\b/i.test(query.request) ||
              /\bchallan\b/i.test(doc.title)) &&
            (!/\bForm A\b/i.test(query.request) ||
              /\bForm A\b/i.test(doc.title)) &&
            (intent.variant !== 'RENEWAL' || /\brenewal\b/i.test(doc.title)) &&
            (intent.variant !== 'ACKNOWLEDGEMENT' ||
              /\backnowledg(?:e)?ment\b/i.test(doc.title)),
        )
        .map((doc) => ({
          id: doc.id,
          kind: 'LIBRARY',
          title: doc.title,
          branchId: doc.branchId,
          owner: null,
          period:
            doc.periodLabel ||
            (doc.periodYear
              ? `${doc.periodYear}-${String(doc.periodMonth || '').padStart(2, '0')}`
              : null),
          status: 'Stored document',
        }));
      if (intent.category === 'RETURN') {
        const returns = await this.db.query(
          `SELECT id, branch_id, return_type, period_year, period_month, status FROM compliance_returns
           WHERE client_id = $1 AND upper(law_type) = ANY($2::text[]) AND is_deleted = false
             AND period_year = $3 AND period_month = $4 AND ($5::uuid IS NULL OR branch_id = $5)
             AND CASE WHEN $6 = 'ACKNOWLEDGEMENT' THEN ack_file_path IS NOT NULL AND ack_file_path <> ''
                      ELSE challan_file_path IS NOT NULL AND challan_file_path <> '' END ORDER BY created_at DESC`,
          [
            scope.clientId,
            intent.subCategory === 'PF' ? ['PF', 'EPF'] : ['ESI', 'ESIC'],
            year,
            month,
            scope.branchId,
            intent.variant,
          ],
        );
        matches.push(
          ...returns
            .filter((doc: any) => this.allowedBranch(scope, doc.branch_id))
            .map((doc: any) => ({
              id: doc.id,
              kind: 'RETURN' as const,
              title: `${doc.return_type} ${intent.variant === 'ACKNOWLEDGEMENT' ? 'acknowledgement' : 'challan'}`,
              branchId: doc.branch_id,
              owner: 'Recorded filing',
              period: `${doc.period_year}-${String(doc.period_month).padStart(2, '0')}`,
              status: doc.status,
              variant: intent.variant,
            })),
        );
      } else if (intent.category === 'LICENSE') {
        const registrations = await this.db.query(
          `SELECT r.id, r.branch_id, r.type, r.status, r.issued_date, r.renewed_on
           FROM branch_registrations r JOIN client_branches b ON b.id = r.branch_id AND b.clientid = r.client_id AND b.isdeleted = false
           WHERE r.client_id = $1 AND ($2::uuid IS NULL OR r.branch_id = $2)
             AND upper(r.type) IN ('SHOPS', 'SHOP', 'SHOPS_ESTABLISHMENT', 'SHOPS_ESTABLISHMENTS', 'SHOPS AND ESTABLISHMENT', 'SHOPS & ESTABLISHMENT')
             AND COALESCE(r.status, 'ACTIVE') <> 'DELETED'
             AND CASE WHEN $3 = 'RENEWAL' THEN r.renewal_document_url IS NOT NULL AND r.renewal_document_url <> ''
                      ELSE COALESCE(NULLIF(r.document_url, ''), NULLIF(r.document_path, '')) IS NOT NULL END ORDER BY r.created_at DESC`,
          [scope.clientId, scope.branchId, intent.variant],
        );
        matches.push(
          ...registrations
            .filter((doc: any) => this.allowedBranch(scope, doc.branch_id))
            .map((doc: any) => ({
              id: doc.id,
              kind: 'REGISTRATION' as const,
              title: `${doc.type} ${intent.variant === 'RENEWAL' ? 'renewal' : 'registration'}`,
              branchId: doc.branch_id,
              owner: 'Branch registration',
              period:
                doc.renewed_on || doc.issued_date
                  ? String(
                      intent.variant === 'RENEWAL'
                        ? doc.renewed_on || ''
                        : doc.issued_date || '',
                    )
                  : null,
              status: doc.status,
              variant: intent.variant,
            })),
        );
      }
    } else {
      const employees = await this.db.query(
        'SELECT id, name, employee_code, branch_id FROM employees WHERE client_id = $1 AND lower(name) = lower($2)',
        [scope.clientId, intent.employeeName],
      );
      const allowed = employees.filter(
        (employee: { branch_id: string | null }) =>
          this.allowedBranch(scope, employee.branch_id),
      );
      ambiguousEmployee = allowed.length > 1;
      for (const employee of allowed) {
        if (intent.kind === 'APPOINTMENT') {
          const docs = await this.db.query(
            `SELECT id, doc_name, created_at FROM employee_documents WHERE client_id = $1 AND employee_id = $2
             AND upper(doc_type) IN ('APPOINTMENT_LETTER', 'APPOINTMENT') ORDER BY created_at DESC`,
            [scope.clientId, employee.id],
          );
          matches.push(
            ...docs.map((doc: any) => ({
              id: doc.id,
              kind: 'EMPLOYEE' as const,
              title: doc.doc_name,
              owner: `${employee.name} (${employee.employee_code})`,
              branchId: employee.branch_id,
              period: String(doc.created_at),
              status: 'Stored document',
            })),
          );
        } else {
          if (intent.latest && intent.kind === 'PAYSLIP') {
            const periods = await this.db.query(
              `SELECT a.period_year, a.period_month FROM payroll_payslip_archives a
               JOIN payroll_runs r ON r.id = a.run_id AND r.client_id = a.client_id
               WHERE a.client_id = $1 AND a.employee_code = $2 AND r.status = 'APPROVED'
               ORDER BY a.period_year DESC, a.period_month DESC LIMIT 1`,
              [scope.clientId, employee.employee_code],
            );
            if (!periods.length) continue;
            year = periods[0].period_year;
            month = periods[0].period_month;
          }
          const listed = await this.payroll.listEmployeeRecords(user, {
            periodMonth: month,
            periodYear: year,
            branchId: scope.branchId || undefined,
            search: employee.employee_code,
          });
          // Find only stored settlement statements; do not synthesize missing documents in Assist.
          const storedFnfIds =
            intent.kind === 'FNF'
              ? new Set(
                  (
                    await this.db.query(
                      `SELECT fnf_id FROM payroll_fnf_documents WHERE client_id = $1 AND employee_id = $2
             AND doc_type = 'SETTLEMENT_STATEMENT' AND file_path IS NOT NULL AND file_path <> ''`,
                      [scope.clientId, employee.id],
                    )
                  ).map((row: any) => row.fnf_id),
                )
              : null;
          matches.push(
            ...listed.records
              .filter(
                (row) =>
                  row.employeeId === employee.id &&
                  (intent.kind === 'PAYSLIP'
                    ? row.payslipAvailable
                    : row.settlementAvailable && storedFnfIds!.has(row.fnfId)),
              )
              .map((row) => ({
                id: (intent.kind === 'PAYSLIP' ? row.runId : row.fnfId)!,
                kind:
                  intent.kind === 'PAYSLIP'
                    ? ('PAYSLIP' as const)
                    : ('FNF' as const),
                title:
                  intent.kind === 'PAYSLIP'
                    ? 'Published payslip'
                    : 'Finalized F&F settlement statement',
                owner: `${employee.name} (${employee.employee_code})`,
                branchId: employee.branch_id,
                period:
                  intent.kind === 'PAYSLIP'
                    ? `${year}-${String(month).padStart(2, '0')}`
                    : null,
                status:
                  intent.kind === 'PAYSLIP' ? row.runStatus! : row.fnfStatus!,
                employeeCode: row.employeeCode,
              })),
          );
        }
      }
    }
    matches = [
      ...new Map(
        matches.map((doc) => [
          `${doc.kind}:${doc.id}:${doc.employeeCode || ''}`,
          doc,
        ]),
      ).values(),
    ];
    if (!matches.length)
      return response(
        'UNAVAILABLE',
        'No available document matched within your permissions and selected period. Check the employee name, period and branch, or ask the document owner to make it available in the existing workspace.',
      );
    return response(
      matches.length === 1 && !ambiguousEmployee ? 'EXACT' : 'SHORTLIST',
      matches.length === 1 && !ambiguousEmployee
        ? 'One permitted document matched.'
        : 'Several permitted documents matched. Choose a document; refine the branch or period if needed.',
      matches.slice(0, 10),
    );
  }

  async view(
    user: ReqUser,
    kind: string,
    id: string,
    query: {
      branchId?: string;
      employeeCode?: string;
      contractorId?: string;
      nonComplianceId?: string;
      variant?: string;
    },
  ) {
    const { scope, master } = await this.context(user, query);
    const unavailable = () =>
      new NotFoundException(
        'Document is unavailable in your current permissions.',
      );
    let result: { buffer: Buffer; fileName: string; fileType: string };
    if (
      (query.contractorId && kind !== 'CONTRACTOR') ||
      (query.nonComplianceId && kind !== 'AUDIT_EVIDENCE')
    )
      throw unavailable();
    if (kind === 'REGISTRATION' || kind === 'RETURN') {
      if (kind === 'RETURN' && !master) throw unavailable();
      const validVariant =
        kind === 'RETURN'
          ? ['CHALLAN', 'ACKNOWLEDGEMENT']
          : ['CERTIFICATE', 'RENEWAL'];
      if (!query.variant || !validVariant.includes(query.variant))
        throw unavailable();
      if (kind === 'RETURN')
        await this.entitlements.assertModule(scope.clientId, 'PAYROLL');
      const [doc] = await this.db.query(
        kind === 'RETURN'
          ? `SELECT branch_id, CASE WHEN $3 = 'ACKNOWLEDGEMENT' THEN ack_file_path ELSE challan_file_path END AS file_path
           FROM compliance_returns WHERE id = $1 AND client_id = $2 AND is_deleted = false AND upper(law_type) IN ('PF', 'EPF', 'ESI', 'ESIC')`
          : `SELECT r.branch_id, CASE WHEN $3 = 'RENEWAL' THEN r.renewal_document_url ELSE COALESCE(NULLIF(r.document_url, ''), NULLIF(r.document_path, '')) END AS file_path
           FROM branch_registrations r JOIN client_branches b ON b.id = r.branch_id AND b.clientid = r.client_id AND b.isdeleted = false
           WHERE r.id = $1 AND r.client_id = $2 AND COALESCE(r.status, 'ACTIVE') <> 'DELETED'
             AND upper(r.type) IN ('SHOPS', 'SHOP', 'SHOPS_ESTABLISHMENT', 'SHOPS_ESTABLISHMENTS', 'SHOPS AND ESTABLISHMENT', 'SHOPS & ESTABLISHMENT')`,
        [id, scope.clientId, query.variant],
      );
      if (!doc || !doc.file_path || !this.allowedBranch(scope, doc.branch_id))
        throw unavailable();
      const safePath = resolveStoredUploadPath(doc.file_path);
      await this.files.assertCanDownload(
        user,
        path
          .relative(path.resolve(process.cwd(), 'uploads'), safePath)
          .replace(/\\/g, '/'),
      );
      result = {
        buffer: fs.readFileSync(safePath),
        fileName: path.basename(safePath),
        fileType: this.storedMime(safePath),
      };
    } else if (kind === 'CONTRACTOR' || kind === 'AUDIT_EVIDENCE') {
      if (!master) throw unavailable();
      await this.entitlements.assertModule(
        scope.clientId,
        kind === 'CONTRACTOR' ? 'CONTRACTOR_DOCUMENTS' : 'CONTRACTOR_AUDIT',
      );
      const [doc] = await this.db.query(
        kind === 'CONTRACTOR'
          ? `SELECT d.file_path, d.file_name, d.file_type, d.branch_id, d.contractor_user_id
           FROM contractor_documents d JOIN branch_contractor bc ON bc.contractor_user_id = d.contractor_user_id AND bc.branch_id = d.branch_id AND bc.client_id = d.client_id
           JOIN users u ON u.id = d.contractor_user_id AND u.deleted_at IS NULL
           WHERE d.id = $1 AND d.client_id = $2 AND ($3::uuid IS NULL OR d.contractor_user_id = $3)`
          : `SELECT rs.file_path, rs.file_name, rs.mime_type AS file_type, a.branch_id, a.id AS audit_id, nc.id AS nc_id
           FROM audit_resubmissions rs JOIN audit_non_compliances nc ON nc.id = rs.non_compliance_id AND nc.audit_id = rs.audit_id
           JOIN audits a ON a.id = nc.audit_id WHERE rs.id = $1 AND a.client_id = $2
             AND ($3::uuid IS NULL OR nc.id = $3) AND a.preliminary_published_at IS NOT NULL AND nc.published_at IS NOT NULL`,
        [
          id,
          scope.clientId,
          kind === 'CONTRACTOR'
            ? query.contractorId || null
            : query.nonComplianceId || null,
        ],
      );
      if (!doc || !this.allowedBranch(scope, doc.branch_id) || !doc.file_path)
        throw unavailable();
      if (kind === 'AUDIT_EVIDENCE') {
        const visible = await this.audits.listNcsForVendor(user, doc.audit_id);
        if (!visible.items.some((nc: any) => nc.id === doc.nc_id))
          throw unavailable();
      } else {
        const safePath = resolveStoredUploadPath(doc.file_path);
        await this.files.assertCanDownload(
          user,
          path
            .relative(path.resolve(process.cwd(), 'uploads'), safePath)
            .replace(/\\/g, '/'),
        );
      }
      result = {
        buffer: this.readStoredFile(doc.file_path),
        fileName: doc.file_name || 'document',
        fileType: doc.file_type || 'application/octet-stream',
      };
    } else if (kind === 'LIBRARY') {
      const docs = await this.library.listForClient(scope.clientId!, user.id, {
        branchId: scope.branchId || undefined,
      });
      const doc = docs.find(
        (doc) => doc.id === id && this.allowedBranch(scope, doc.branchId),
      );
      if (!doc || (!master && doc.category !== 'LICENSE')) throw unavailable();
      if (doc.category === 'REGISTER' || doc.category === 'RETURN')
        await this.entitlements.assertModule(scope.clientId, 'PAYROLL');
      if (doc.category === 'AUDIT_REPORT')
        await this.entitlements.assertModule(
          scope.clientId,
          'CONTRACTOR_AUDIT',
        );
      const file = await this.library.getDocumentForDownload(
        id,
        user.id,
        'CLIENT',
        scope.clientId!,
      );
      result = {
        buffer: this.readStoredFile(file.absolutePath),
        fileName: file.fileName,
        fileType: file.mimeType,
      };
    } else {
      if (!master) throw unavailable();
      if (kind === 'EMPLOYEE') {
        const [doc] = await this.db.query(
          `SELECT d.file_path, d.doc_name, d.mime_type, e.branch_id FROM employee_documents d
           JOIN employees e ON e.id = d.employee_id AND e.client_id = d.client_id
           WHERE d.id = $1 AND d.client_id = $2 AND upper(d.doc_type) IN ('APPOINTMENT_LETTER', 'APPOINTMENT')`,
          [id, scope.clientId],
        );
        if (!doc || !this.allowedBranch(scope, doc.branch_id))
          throw unavailable();
        result = {
          buffer: this.readStoredFile(doc.file_path),
          fileName: doc.doc_name,
          fileType: doc.mime_type || 'application/octet-stream',
        };
      } else if (kind === 'PAYSLIP' || kind === 'FNF') {
        await this.entitlements.assertModule(scope.clientId, 'PAYROLL');
        // Recheck the selected branch even for a forged or stale shortlist URL.
        const rows = await this.db.query(
          kind === 'PAYSLIP'
            ? `SELECT e.branch_id FROM payroll_run_employees r JOIN employees e ON e.id = r.employee_id AND e.client_id = r.client_id WHERE r.run_id = $1 AND r.client_id = $2 AND r.employee_code = $3`
            : `SELECT e.branch_id FROM payroll_fnf f JOIN employees e ON e.id = f.employee_id AND e.client_id = f.client_id WHERE f.id = $1 AND f.client_id = $2`,
          kind === 'PAYSLIP'
            ? [id, scope.clientId, query.employeeCode || '']
            : [id, scope.clientId],
        );
        if (
          !rows.length ||
          !rows.every((row: any) => this.allowedBranch(scope, row.branch_id))
        )
          throw unavailable();
        if (kind === 'FNF') {
          const stored = await this.db.query(
            `SELECT file_path FROM payroll_fnf_documents WHERE fnf_id = $1 AND client_id = $2
             AND doc_type = 'SETTLEMENT_STATEMENT' ORDER BY created_at DESC`,
            [id, scope.clientId],
          );
          const file = stored.find(
            (doc: any) => doc.file_path && fs.existsSync(doc.file_path),
          );
          if (!file) throw unavailable();
          this.readStoredFile(file.file_path);
        }
        result =
          kind === 'PAYSLIP'
            ? await this.payroll.downloadPayslip(
                user,
                id,
                query.employeeCode || '',
                { resolveStoredPath: resolveStoredUploadPath },
              )
            : await this.payroll.downloadFnfDocument(
                user,
                id,
                'SETTLEMENT_STATEMENT',
                {
                  storedOnly: true,
                  resolveStoredPath: resolveStoredUploadPath,
                },
              );
      } else throw unavailable();
    }
    // Fail closed if recording the view fails; no business records are mutated.
    await this.audit.log({
      entityType: 'DOCUMENT',
      entityId: id,
      action: 'DOCUMENT_VIEWED',
      performedBy: user.id,
      performedRole: user.roleCode,
      meta: {
        module: 'legitx-assist',
        kind,
        clientId: scope.clientId,
        branchId: scope.branchId,
      },
    });
    return result;
  }

  private readStoredFile(filePath: string) {
    return fs.readFileSync(resolveStoredUploadPath(filePath));
  }
  private storedMime(filePath: string) {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.pdf'
      ? 'application/pdf'
      : ext === '.png'
        ? 'image/png'
        : ['.jpg', '.jpeg'].includes(ext)
          ? 'image/jpeg'
          : 'application/octet-stream';
  }
}
