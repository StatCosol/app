import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { ComplianceTask, TaskStatus } from './entities/compliance-task.entity';
import { ComplianceEvidence } from './entities/compliance-evidence.entity';
import { ComplianceComment } from './entities/compliance-comment.entity';
import {
  ComplianceMcdItem,
  McdItemStatus,
} from './entities/compliance-mcd-item.entity';
import { DocumentRemark } from './entities/document-remark.entity';
import { DocumentReuploadRequest } from './entities/document-reupload-request.entity';
import { DocumentVersion } from './entities/document-version.entity';
import { UserEntity } from '../users/entities/user.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { AssignmentsService } from '../assignments/assignments.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { AiRiskCacheInvalidatorService } from '../ai/ai-risk-cache-invalidator.service';
import { ReqUser } from '../access/access-scope.service';
import { ComplianceReuploadService } from './compliance-reupload.service';
import { ComplianceDashboardService } from './compliance-dashboard.service';
import { ComplianceCrmTasksService } from './compliance-crm-tasks.service';
import { CompliancePortalTasksService } from './compliance-portal-tasks.service';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    @InjectRepository(ComplianceMasterEntity)
    private masters: Repository<ComplianceMasterEntity>,
    @InjectRepository(ComplianceTask)
    private tasks: Repository<ComplianceTask>,
    @InjectRepository(ComplianceEvidence)
    private evidence: Repository<ComplianceEvidence>,
    @InjectRepository(ComplianceComment)
    private comments: Repository<ComplianceComment>,
    @InjectRepository(ComplianceMcdItem)
    private mcdItems: Repository<ComplianceMcdItem>,
    @InjectRepository(DocumentRemark)
    private remarkRepo: Repository<DocumentRemark>,
    @InjectRepository(DocumentReuploadRequest)
    private reuploadReqRepo: Repository<DocumentReuploadRequest>,
    @InjectRepository(DocumentVersion)
    private versionRepo: Repository<DocumentVersion>,
    @InjectRepository(UserEntity)
    private users: Repository<UserEntity>,
    @InjectRepository(BranchEntity)
    private branches: Repository<BranchEntity>,
    private readonly assignmentsService: AssignmentsService,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly riskCache: AiRiskCacheInvalidatorService,
    private readonly reuploadService: ComplianceReuploadService,
    private readonly dashboardService: ComplianceDashboardService,
    private readonly crmTasksService: ComplianceCrmTasksService,
    private readonly portalTasksService: CompliancePortalTasksService,
  ) {}

  // Common: list compliance master entries for admin/frontends
  async listComplianceMaster(user: ReqUser) {
    this.assertRole(user, ['ADMIN']);
    return this.masters.find({
      where: { isActive: true },
      order: { complianceName: 'ASC' },
    });
  }

  // ---------- Helpers ----------
  private assertRole(user: ReqUser, allowed: string[]) {
    if (!allowed.includes(user?.roleCode)) {
      throw new ForbiddenException('Access denied');
    }
  }

  private toDateOnly(d: Date): string {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private computePeriodCode(year: number, month?: number | null): string {
    if (month && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}`;
    }
    return `${year}`;
  }

  private computeUploadWindow(
    periodYear: number,
    periodMonth?: number | null,
  ): { startDate: string; endDate: string } | null {
    if (!periodMonth || periodMonth < 1 || periodMonth > 12) return null;
    const nextMonth = periodMonth === 12 ? 1 : periodMonth + 1;
    const nextYear = periodMonth === 12 ? periodYear + 1 : periodYear;
    const start = new Date(Date.UTC(nextYear, nextMonth - 1, 20));
    const end = new Date(Date.UTC(nextYear, nextMonth - 1, 27));
    return {
      startDate: this.toDateOnly(start),
      endDate: this.toDateOnly(end),
    };
  }

  private async assertCrmAssignedToClient(crmUserId: string, clientId: string) {
    const ok = await this.assignmentsService.isClientAssignedToCrm(
      clientId,
      crmUserId,
    );
    if (!ok) throw new ForbiddenException('Client not assigned to this CRM');
  }

  private async getEvidenceWithTaskOrThrow(
    docId: string | number,
  ): Promise<ComplianceEvidence & { task: ComplianceTask }> {
    const doc = await this.evidence.findOne({
      where: { id: Number(docId) },
      relations: ['task'],
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    if (!doc.task) {
      throw new NotFoundException('Task not found for document');
    }
    return doc as ComplianceEvidence & { task: ComplianceTask };
  }

  // ---------- Dashboards — delegated to ComplianceDashboardService ----------

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
  }

  async auditorDashboard(user: ReqUser) {
    return this.dashboardService.auditorDashboard(user);
  }
  // ---------- CRM APIs — delegated to ComplianceCrmTasksService ----------

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
  }
  // ---------- Portal task APIs — delegated to CompliancePortalTasksService ----------

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
  }
  // ---------- Reupload APIs — delegated to ComplianceReuploadService ----------

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

  async branchMarkReuploadNotApplicable(user: ReqUser, requestId: string, remarks: string) {
    return this.reuploadService.branchMarkReuploadNotApplicable(user, requestId, remarks);
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

  async contractorGetDocRemarks(user: ReqUser, docId: string) {
    return this.reuploadService.contractorGetDocRemarks(user, docId);
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

  async auditorRejectReupload(user: ReqUser, requestId: string, remarks: string) {
    return this.reuploadService.auditorRejectReupload(user, requestId, remarks);
  }

  async crmListReuploadRequests(user: ReqUser, q: Record<string, string>) {
    return this.reuploadService.crmListReuploadRequests(user, q);
  }

  async crmTopOverdueReuploadUnits(user: ReqUser, q: Record<string, string>) {
    return this.reuploadService.crmTopOverdueReuploadUnits(user, q);
  }

}