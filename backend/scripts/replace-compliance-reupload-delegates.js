const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../src/compliance/compliance.service.ts');
const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/);

const start = lines.findIndex((l) =>
  l.includes('// ---------- Client (LegitX) Reupload APIs'),
);
const end = lines.findIndex((l, i) => i > start && l.trim() === '}');
if (start < 0) {
  console.error('start not found');
  process.exit(1);
}

// Class closing brace is last line; find crmTopOverdue end before it
const crmEnd = lines.findIndex((l) =>
  l.includes('async crmTopOverdueReuploadUnits'),
);
let endIdx = lines.length - 1;
for (let i = crmEnd; i < lines.length; i++) {
  if (lines[i].trim() === '}' && i > crmEnd + 5) {
    endIdx = i;
    break;
  }
}

const delegates = `  // ---------- Reupload APIs — delegated to ComplianceReuploadService ----------

  async clientListReuploadRequests(user: ReqUser, filters?: Record<string, string>) {
    return this.reuploadService.clientListReuploadRequests(user, filters);
  }

  async clientReuploadFile(user: ReqUser, requestId: string, file: Express.Multer.File) {
    return this.reuploadService.clientReuploadFile(user, requestId, file);
  }

  async clientSubmitReupload(user: ReqUser, requestId: string) {
    return this.reuploadService.clientSubmitReupload(user, requestId);
  }

  async branchListReuploadRequests(user: ReqUser, filters?: Record<string, string>) {
    return this.reuploadService.branchListReuploadRequests(user, filters);
  }

  async branchReuploadFile(user: ReqUser, requestId: string, file: Express.Multer.File) {
    return this.reuploadService.branchReuploadFile(user, requestId, file);
  }

  async branchSubmitReupload(user: ReqUser, requestId: string) {
    return this.reuploadService.branchSubmitReupload(user, requestId);
  }

  async branchMarkReuploadNotApplicable(user: ReqUser, requestId: string, reason: string) {
    return this.reuploadService.branchMarkReuploadNotApplicable(user, requestId, reason);
  }

  async contractorListReuploadRequests(user: ReqUser, filters?: Record<string, string>) {
    return this.reuploadService.contractorListReuploadRequests(user, filters);
  }

  async contractorReuploadFile(user: ReqUser, requestId: string, file: Express.Multer.File) {
    return this.reuploadService.contractorReuploadFile(user, requestId, file);
  }

  async contractorSubmitReupload(user: ReqUser, requestId: string) {
    return this.reuploadService.contractorSubmitReupload(user, requestId);
  }

  async createReuploadRequestsFromAuditor(
    user: ReqUser,
    dto: { taskId: string; items: { docId: string; remarks: string }[] },
  ) {
    return this.reuploadService.createReuploadRequestsFromAuditor(user, dto);
  }

  async auditorListReuploadRequests(user: ReqUser, q: Record<string, string>) {
    return this.reuploadService.auditorListReuploadRequests(user, q);
  }

  async auditorApproveReupload(user: ReqUser, requestId: string, remarks?: string) {
    return this.reuploadService.auditorApproveReupload(user, requestId, remarks);
  }

  async auditorRejectReupload(
    user: ReqUser,
    requestId: string,
    remarks: string,
    createNewRequest?: boolean,
  ) {
    return this.reuploadService.auditorRejectReupload(
      user,
      requestId,
      remarks,
      createNewRequest,
    );
  }

  async crmListReuploadRequests(user: ReqUser, q: Record<string, string>) {
    return this.reuploadService.crmListReuploadRequests(user, q);
  }

  async crmTopOverdueReuploadUnits(user: ReqUser, q: Record<string, string>) {
    return this.reuploadService.crmTopOverdueReuploadUnits(user, q);
  }
`;

const newLines = [...lines.slice(0, start), delegates.trimEnd(), '', '}'];
fs.writeFileSync(src, newLines.join('\n'));
console.log('Updated compliance.service.ts with reupload delegates');
