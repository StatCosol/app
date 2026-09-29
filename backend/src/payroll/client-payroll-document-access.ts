/**
 * F&F cases the payroll user has both approved and finalized.
 * APPROVED alone stays in the payroll module until the case is settled,
 * documents are issued, or the case is completed.
 */
export const FINALIZED_FNF_STATUSES = [
  'SETTLED',
  'DOCS_ISSUED',
  'COMPLETED',
] as const;

export const CLIENT_FNF_DOC_TYPES = [
  'SETTLEMENT_STATEMENT',
  'RELIEVING_LETTER',
] as const;

export type ClientFnfDocType = (typeof CLIENT_FNF_DOC_TYPES)[number];

export function isApprovedPayrollRun(status: string | null | undefined): boolean {
  return String(status || '').toUpperCase() === 'APPROVED';
}

export function isFinalizedFnfStatus(status: string | null | undefined): boolean {
  return FINALIZED_FNF_STATUSES.includes(
    String(status || '').toUpperCase() as (typeof FINALIZED_FNF_STATUSES)[number],
  );
}

export function isClientFnfDocType(docType: string | null | undefined): docType is ClientFnfDocType {
  return CLIENT_FNF_DOC_TYPES.includes(
    String(docType || '').toUpperCase() as ClientFnfDocType,
  );
}

/**
 * A payslip is visible in LegitX and BranchDesk only after the payroll user
 * has approved the run and finalized it by publishing the payslip file.
 */
export function payslipDownloadVisible(
  runStatus: string | null | undefined,
  publishedFileReady: boolean,
): boolean {
  return isApprovedPayrollRun(runStatus) && publishedFileReady;
}

/**
 * Settlement and relieving documents are visible only after the payroll user
 * has approved and finalized the F&F case. A stored file is used when one
 * exists; otherwise the finalized case can be rendered.
 */
export function fnfDownloadVisible(
  fnfStatus: string | null | undefined,
  documentReady: boolean,
): boolean {
  return isFinalizedFnfStatus(fnfStatus) && documentReady;
}

export function fnfDocumentReady(fnfStatus: string | null | undefined): boolean {
  return isFinalizedFnfStatus(fnfStatus);
}

export interface BranchScopeInput {
  userType: string | null | undefined;
  userBranchIds?: string[] | null;
  payrollBranchScope?: 'ALL' | 'SELECTED' | string | null;
  payrollAllowedBranchIds?: string[] | null;
  requestedBranchId?: string | null;
}

export interface BranchScope {
  /** null means every branch of the client (LegitX master, no branch filter). */
  branchIds: string[] | null;
  forbidden: boolean;
}

/**
 * BranchDesk users are limited to the intersection of their assigned branches
 * and, when the client selected specific payroll branches, that allow-list.
 * LegitX master users keep the whole client, plus an optional branch filter.
 */
export function resolveAuthorizedBranches(input: BranchScopeInput): BranchScope {
  const requested = input.requestedBranchId || null;
  if (input.userType !== 'BRANCH') {
    return {
      branchIds: requested ? [requested] : null,
      forbidden: false,
    };
  }

  let ids = [...(input.userBranchIds || [])].filter(Boolean);
  if (String(input.payrollBranchScope || 'ALL').toUpperCase() === 'SELECTED') {
    const allowed = new Set(input.payrollAllowedBranchIds || []);
    ids = ids.filter((id) => allowed.has(id));
  }
  if (requested && !ids.includes(requested)) {
    return { branchIds: [], forbidden: true };
  }
  return {
    branchIds: requested ? [requested] : ids,
    forbidden: false,
  };
}

export function employeeBranchAllowed(
  branchIds: string[] | null,
  employeeBranchId: string | null | undefined,
): boolean {
  if (branchIds === null) return true;
  if (!employeeBranchId) return false;
  return branchIds.includes(employeeBranchId);
}

export interface RunEmployeeSource {
  employeeId: string | null;
  employeeCode: string;
  employeeName: string;
  branchId: string | null;
  runId: string;
  runStatus: string | null;
  runBranchId: string | null;
}

export interface PayslipArchiveSource {
  runId: string;
  employeeCode: string;
  fileName: string;
  filePath: string;
}

export interface FnfSource {
  id: string;
  employeeId: string;
  status: string;
  updatedAt: string | Date;
}

export interface FnfDocumentSource {
  fnfId: string;
  employeeId: string;
  docType: string;
  fileName: string;
  filePath: string;
  createdAt: string | Date;
}

export interface EmployeeBranchSource {
  id: string;
  branchId: string | null;
  name?: string | null;
  employeeCode?: string | null;
}

export interface EmployeePayrollRecordView {
  employeeId: string | null;
  employeeCode: string;
  employeeName: string;
  branchId: string | null;
  runId: string | null;
  runStatus: string | null;
  payslipAvailable: boolean;
  fnfId: string | null;
  fnfStatus: string | null;
  settlementAvailable: boolean;
  relievingAvailable: boolean;
}

export function assembleEmployeePayrollRecords(input: {
  branchIds: string[] | null;
  runEmployees: RunEmployeeSource[];
  archives: PayslipArchiveSource[];
  fnfCases: FnfSource[];
  fnfDocuments: FnfDocumentSource[];
  employees: EmployeeBranchSource[];
  fileExists: (filePath: string) => boolean;
}): { records: EmployeePayrollRecordView[]; bulkPayslipAvailable: boolean } {
  const employeeById = new Map(input.employees.map((row) => [row.id, row]));
  const archiveReady = new Set<string>();
  for (const archive of input.archives) {
    if (archive.filePath && input.fileExists(archive.filePath)) {
      archiveReady.add(archiveKey(archive.runId, archive.employeeCode));
    }
  }

  const latestFnf = new Map<string, FnfSource>();
  for (const fnf of input.fnfCases) {
    const current = latestFnf.get(fnf.employeeId);
    if (!current || timeOf(fnf.updatedAt) >= timeOf(current.updatedAt)) {
      latestFnf.set(fnf.employeeId, fnf);
    }
  }

  const records = new Map<string, EmployeePayrollRecordView>();

  for (const row of input.runEmployees) {
    const master = row.employeeId ? employeeById.get(row.employeeId) : undefined;
    const branchId = row.branchId || row.runBranchId || master?.branchId || null;
    if (!employeeBranchAllowed(input.branchIds, branchId)) continue;
    const key = recordKey(row.employeeId, row.employeeCode);
    const payslipAvailable = payslipDownloadVisible(
      row.runStatus,
      archiveReady.has(archiveKey(row.runId, row.employeeCode)),
    );
    if (!payslipAvailable) continue;
    const existing = records.get(key);
    if (!existing || !existing.payslipAvailable) {
      records.set(key, {
        employeeId: row.employeeId,
        employeeCode: row.employeeCode,
        employeeName: row.employeeName || master?.name || row.employeeCode,
        branchId,
        runId: row.runId,
        runStatus: row.runStatus,
        payslipAvailable,
        fnfId: existing?.fnfId ?? null,
        fnfStatus: existing?.fnfStatus ?? null,
        settlementAvailable: existing?.settlementAvailable ?? false,
        relievingAvailable: existing?.relievingAvailable ?? false,
      });
    }
  }

  for (const fnf of latestFnf.values()) {
    const master = employeeById.get(fnf.employeeId);
    if (!master) continue;
    const branchId = master.branchId || null;
    if (!employeeBranchAllowed(input.branchIds, branchId)) continue;
    const key = recordKey(fnf.employeeId, master.employeeCode || fnf.employeeId);
    const ready = fnfDocumentReady(fnf.status);
    const settlementAvailable = fnfDownloadVisible(fnf.status, ready);
    const relievingAvailable = fnfDownloadVisible(fnf.status, ready);
    const existing = records.get(key);
    if (!existing && !settlementAvailable && !relievingAvailable) continue;
    if (existing) {
      existing.fnfId = fnf.id;
      existing.fnfStatus = fnf.status;
      existing.settlementAvailable = settlementAvailable;
      existing.relievingAvailable = relievingAvailable;
      if (!existing.branchId) existing.branchId = branchId;
      continue;
    }
    records.set(key, {
      employeeId: fnf.employeeId,
      employeeCode: master.employeeCode || '',
      employeeName: master.name || master.employeeCode || 'Employee',
      branchId,
      runId: null,
      runStatus: null,
      payslipAvailable: false,
      fnfId: fnf.id,
      fnfStatus: fnf.status,
      settlementAvailable,
      relievingAvailable,
    });
  }

  const list = [...records.values()]
    .filter((row) => row.employeeCode)
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.employeeCode.localeCompare(b.employeeCode));

  return {
    records: list,
    bulkPayslipAvailable: list.some((row) => row.payslipAvailable),
  };
}

export function archiveKey(runId: string, employeeCode: string): string {
  return `${runId}::${employeeCode}`;
}

function recordKey(employeeId: string | null, employeeCode: string): string {
  return employeeId ? `id:${employeeId}` : `code:${employeeCode}`;
}

function timeOf(value: string | Date): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}
