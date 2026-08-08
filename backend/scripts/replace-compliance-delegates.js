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

const dashStart = findLine((l) => l.includes('// ---------- Dashboards'));
const dashEnd = findLine((l) => l.includes('// ---------- CRM APIs'));
const crmStart = dashEnd;
const crmEnd = findLine((l) => l.includes('// ---------- Contractor APIs'));

const dashDelegates = `  // ---------- Dashboards — delegated to ComplianceDashboardService ----------

  async crmDashboard(user: ReqUser) {
    return this.dashboardService.crmDashboard(user);
  }

  async contractorDashboard(user: ReqUser) {
    return this.dashboardService.contractorDashboard(user);
  }

  async clientDashboard(user: ReqUser) {
    return this.dashboardService.clientDashboard(user);
  }

  async adminDashboard(user: ReqUser) {
    return this.dashboardService.adminDashboard(user);
  }`;

const crmDelegates = `  // ---------- CRM APIs — delegated to ComplianceCrmTasksService ----------

  async crmTaskKpis(user: ReqUser) {
    return this.crmTasksService.crmTaskKpis(user);
  }

  async crmBulkApprove(user: ReqUser, taskIds: number[], remarks?: string) {
    return this.crmTasksService.crmBulkApprove(user, taskIds, remarks);
  }

  async crmBulkReject(user: ReqUser, taskIds: number[], remarks: string) {
    return this.crmTasksService.crmBulkReject(user, taskIds, remarks);
  }

  async crmCreateTask(
    user: ReqUser,
    dto: {
      clientId: string;
      branchId?: string;
      complianceId: string;
      periodYear: number;
      periodMonth?: number;
      periodLabel?: string;
      dueDate: string;
      assignedToUserId?: string;
      remarks?: string;
    },
  ) {
    return this.crmTasksService.crmCreateTask(user, dto);
  }

  async crmListTasks(user: ReqUser, q: Record<string, string>) {
    return this.crmTasksService.crmListTasks(user, q);
  }

  async crmGetTaskDetail(user: ReqUser, taskId: string) {
    return this.crmTasksService.crmGetTaskDetail(user, taskId);
  }

  async crmAssignTask(user: ReqUser, taskId: string, assignedToUserId: string) {
    return this.crmTasksService.crmAssignTask(user, taskId, assignedToUserId);
  }

  async crmApprove(user: ReqUser, taskId: string, remarks?: string) {
    return this.crmTasksService.crmApprove(user, taskId, remarks);
  }

  async crmReject(user: ReqUser, taskId: string, remarks: string) {
    return this.crmTasksService.crmReject(user, taskId, remarks);
  }`;

lines.splice(crmStart, crmEnd - crmStart, crmDelegates);
const dashStart2 = findLine((l) => l.includes('// ---------- Dashboards'));
const dashEnd2 = findLine((l) => l.includes('// ---------- CRM APIs'));
lines.splice(dashStart2, dashEnd2 - dashStart2, dashDelegates);

fs.writeFileSync(src, lines.join('\n'));
console.log('compliance.service dashboard/crm delegates');
