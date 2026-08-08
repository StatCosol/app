const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/compliance/compliance.service.ts');
let lines = fs.readFileSync(src, 'utf8').split('\n');

function findLine(pred, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (pred(lines[i], i)) return i;
  }
  return -1;
}

const helperStart = findLine((l) => l.includes('private async getContractorScope'));
const evidenceStart = findLine((l) => l.includes('private async getEvidenceWithTaskOrThrow'));
const loadTaskStart = findLine((l) => l.includes('private async loadTaskOrThrow'));
const dashboardMarker = findLine((l) => l.includes('// ---------- Dashboards'));
const contractorStart = findLine((l) => l.includes('// ---------- Contractor APIs'));
const reuploadMarker = findLine((l) => l.includes('// ---------- Reupload APIs'));

const evidenceBlock = lines.slice(evidenceStart, loadTaskStart).join('\n');

const delegates = `  // ---------- Portal task APIs — delegated to CompliancePortalTasksService ----------

  async contractorListTasks(user: ReqUser, q: Record<string, string>) {
    return this.portalTasksService.contractorListTasks(user, q);
  }

  async contractorGetTaskDetail(user: ReqUser, taskId: string) {
    return this.portalTasksService.contractorGetTaskDetail(user, taskId);
  }

  async contractorAddComment(user: ReqUser, taskId: string, message: string) {
    return this.portalTasksService.contractorAddComment(user, taskId, message);
  }

  async contractorSetInProgress(user: ReqUser, taskId: string) {
    return this.portalTasksService.contractorSetInProgress(user, taskId);
  }

  async contractorSubmit(user: ReqUser, taskId: string) {
    return this.portalTasksService.contractorSubmit(user, taskId);
  }

  async contractorMarkNotApplicable(user: ReqUser, taskId: string, remarks: string) {
    return this.portalTasksService.contractorMarkNotApplicable(user, taskId, remarks);
  }

  async contractorUploadEvidence(
    user: ReqUser,
    taskId: string,
    file: Express.Multer.File,
    notes?: string,
  ) {
    return this.portalTasksService.contractorUploadEvidence(user, taskId, file, notes);
  }

  async auditorListTasks(user: ReqUser, q: Record<string, string>) {
    return this.portalTasksService.auditorListTasks(user, q);
  }

  async auditorGetTaskDetail(user: ReqUser, taskId: string) {
    return this.portalTasksService.auditorGetTaskDetail(user, taskId);
  }

  async auditorShareReport(user: ReqUser, taskId: string, notes: string) {
    return this.portalTasksService.auditorShareReport(user, taskId, notes);
  }

  async clientListTasks(user: ReqUser, q: Record<string, string>) {
    return this.portalTasksService.clientListTasks(user, q);
  }

  async autoGenerateMonthlyTasks(
    clientId: string,
    branchId: string,
    year: number,
    month: number,
  ) {
    return this.portalTasksService.autoGenerateMonthlyTasks(clientId, branchId, year, month);
  }

  async clientListMcdItems(user: ReqUser, taskId: string | number) {
    return this.portalTasksService.clientListMcdItems(user, taskId);
  }

  async clientUploadEvidence(
    user: ReqUser,
    taskId: string,
    file: Express.Multer.File,
    notes?: string,
    mcdItemId?: string | number,
  ) {
    return this.portalTasksService.clientUploadEvidence(user, taskId, file, notes, mcdItemId);
  }

  async clientSubmitTask(user: ReqUser, taskId: string) {
    return this.portalTasksService.clientSubmitTask(user, taskId);
  }

  async adminListTasks(user: ReqUser, q: Record<string, string>) {
    return this.portalTasksService.adminListTasks(user, q);
  }

  async auditorListDocs(user: ReqUser, filters: Record<string, string>) {
    return this.portalTasksService.auditorListDocs(user, filters);
  }

  async auditorAddRemark(
    user: ReqUser,
    docId: string,
    dto: { text: string; visibility: string },
  ) {
    return this.portalTasksService.auditorAddRemark(user, docId, dto);
  }`;

// Remove portal helpers (keep getEvidenceWithTaskOrThrow)
lines.splice(helperStart, evidenceStart - helperStart);
const evidenceStart2 = findLine((l) => l.includes('private async getEvidenceWithTaskOrThrow'));
const loadTaskStart2 = findLine((l) => l.includes('private async loadTaskOrThrow'));
const dashboardMarker2 = findLine((l) => l.includes('// ---------- Dashboards'));
lines.splice(loadTaskStart2, dashboardMarker2 - loadTaskStart2);

// Replace portal methods with delegates
const contractorStart2 = findLine((l) => l.includes('// ---------- Contractor APIs'));
const portalEnd = findLine((l) => l.includes('async auditorAddRemark'), contractorStart);
let portalEndLine = portalEnd;
for (let i = portalEnd; i < lines.length; i++) {
  if (lines[i].trim() === '}' && i > portalEnd + 3) {
    portalEndLine = i + 1;
    break;
  }
}
lines.splice(contractorStart2, portalEndLine - contractorStart2, delegates);

// Add import and constructor injection if missing
let text = lines.join('\n');
if (!text.includes('CompliancePortalTasksService')) {
  text = text.replace(
    "import { ComplianceCrmTasksService } from './compliance-crm-tasks.service';",
    "import { ComplianceCrmTasksService } from './compliance-crm-tasks.service';\nimport { CompliancePortalTasksService } from './compliance-portal-tasks.service';",
  );
  text = text.replace(
    'private readonly crmTasksService: ComplianceCrmTasksService,\n  ) {}',
    'private readonly crmTasksService: ComplianceCrmTasksService,\n    private readonly portalTasksService: CompliancePortalTasksService,\n  ) {}',
  );
}

fs.writeFileSync(src, text);
console.log('compliance.service portal delegates applied');
