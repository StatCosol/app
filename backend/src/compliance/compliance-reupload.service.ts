import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ComplianceTask } from './entities/compliance-task.entity';
import { ComplianceEvidence } from './entities/compliance-evidence.entity';
import { DocumentRemark } from './entities/document-remark.entity';
import { DocumentReuploadRequest } from './entities/document-reupload-request.entity';
import { DocumentVersion } from './entities/document-version.entity';
import { UserEntity } from '../users/entities/user.entity';
import { BranchEntity } from '../branches/entities/branch.entity';
import { AssignmentsService } from '../assignments/assignments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { AiRiskCacheInvalidatorService } from '../ai/ai-risk-cache-invalidator.service';
import { ReqUser } from '../access/access-scope.service';

@Injectable()
export class ComplianceReuploadService {
  private readonly logger = new Logger(ComplianceReuploadService.name);

  constructor(
    @InjectRepository(ComplianceTask)
    private readonly tasks: Repository<ComplianceTask>,
    @InjectRepository(ComplianceEvidence)
    private readonly evidence: Repository<ComplianceEvidence>,
    @InjectRepository(DocumentRemark)
    private readonly remarkRepo: Repository<DocumentRemark>,
    @InjectRepository(DocumentReuploadRequest)
    private readonly reuploadReqRepo: Repository<DocumentReuploadRequest>,
    @InjectRepository(DocumentVersion)
    private readonly versionRepo: Repository<DocumentVersion>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    private readonly assignmentsService: AssignmentsService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly riskCache: AiRiskCacheInvalidatorService,
  ) {}

  private assertRole(user: ReqUser, allowed: string[]) {
    if (!allowed.includes(user?.roleCode)) {
      throw new ForbiddenException('Access denied');
    }
  }

  private async assertAuditorAssignedToClient(
    auditorUserId: string,
    clientId: string,
  ) {
    const assigned =
      await this.assignmentsService.getAssignedClientsForAuditor(auditorUserId);
    const ok = (assigned || []).some((c) => c.id === clientId);
    if (!ok)
      throw new ForbiddenException('Client not assigned to this auditor');
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

  // ---------- Client (LegitX) Reupload APIs ----------

  /**
   * List reupload requests for client master user (targetRole = CLIENT)
   */
  async clientListReuploadRequests(
    user: ReqUser,
    filters?: Record<string, string>,
  ) {
    this.assertRole(user, ['CLIENT']);
    if (!user.clientId) throw new ForbiddenException('Client missing clientId');

    const qb = this.reuploadReqRepo
      .createQueryBuilder('req')
      .where('req.clientId = :clientId', { clientId: String(user.clientId) })
      .andWhere('req.targetRole = :role', { role: 'CLIENT' });

    if (filters?.status) {
      qb.andWhere('req.status = :status', { status: filters.status });
    }

    qb.orderBy('req.createdAt', 'DESC');

    const data = await qb.getMany();
    return { data };
  }

  /**
   * Upload corrected file for a client reupload request
   */
  async clientReuploadFile(
    user: ReqUser,
    requestId: string,
    file: Express.Multer.File,
  ) {
    this.assertRole(user, ['CLIENT']);
    if (!user.clientId) throw new ForbiddenException('Client missing clientId');

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Reupload request not found');

    if (
      request.targetRole !== 'CLIENT' ||
      String(request.clientId) !== String(user.clientId)
    ) {
      throw new ForbiddenException('Not your request');
    }
    if (request.status !== 'OPEN') {
      throw new BadRequestException('Request is not open');
    }

    const originalDoc = await this.evidence.findOne({
      where: { id: Number(request.documentId) },
    });
    if (!originalDoc)
      throw new NotFoundException('Original document not found');

    const currentVersion = await this.versionRepo.count({
      where: {
        documentId: originalDoc.id,
        documentType: 'COMPLIANCE_EVIDENCE',
      },
    });

    const newVersion = this.versionRepo.create({
      documentId: originalDoc.id,
      documentType: 'COMPLIANCE_EVIDENCE',
      versionNo: currentVersion + 1,
      filePath: file.path.replace(/\\/g, '/'),
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      uploadedByRole: 'CLIENT',
      uploadedByUserId: user.userId,
      reuploadRequestId: requestId,
    });
    await this.versionRepo.save(newVersion);

    await this.evidence.update(
      { id: originalDoc.id },
      {
        filePath: file.path.replace(/\\/g, '/'),
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
      },
    );

    return { message: 'File uploaded', versionId: newVersion.id };
  }

  /**
   * Submit client reupload for auditor re-verification
   */
  async clientSubmitReupload(user: ReqUser, requestId: string) {
    this.assertRole(user, ['CLIENT']);
    if (!user.clientId) throw new ForbiddenException('Client missing clientId');

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Reupload request not found');

    if (
      request.targetRole !== 'CLIENT' ||
      String(request.clientId) !== String(user.clientId)
    ) {
      throw new ForbiddenException('Not your request');
    }
    if (request.status !== 'OPEN') {
      throw new BadRequestException('Request is not open');
    }

    const versionExists = await this.versionRepo.findOne({
      where: { reuploadRequestId: requestId },
    });
    if (!versionExists) {
      throw new BadRequestException('Please upload file before submitting');
    }

    await this.reuploadReqRepo.update(
      { id: requestId },
      { status: 'SUBMITTED', submittedAt: new Date() },
    );

    // Notify the auditor who requested the reupload
    if (request.requestedByUserId) {
      try {
        await this.notifications.createTicket(user.userId, 'CLIENT', {
          queryType: 'COMPLIANCE',
          subject: `Reupload Submitted — Doc #${request.documentId}`,
          message: `A client user has re-uploaded a document and it is ready for your review.`,
          clientId: request.clientId ? String(request.clientId) : undefined,
        });
      } catch (e) {
        this.logger.warn(
          'notification failure (non-blocking)',
          (e as Error)?.message,
        );
      }

      const auditor = await this.users.findOne({
        where: { id: request.requestedByUserId },
      });
      if (auditor?.email) {
        await this.email
          .send(
            auditor.email,
            `Reupload Submitted — Doc #${request.documentId}`,
            'Reupload Submitted for Verification',
            'A client user has re-uploaded a corrected document. Please log in to verify.',
          )
          .catch((e) =>
            this.logger.warn('email send failed (non-blocking)', e?.message),
          );
      }
    }

    // Notify CRM about submission
    await this.notifyCrmReuploadEvent(
      user.userId,
      'CLIENT',
      request,
      `Reupload Submitted (CLIENT) — Doc #${request.documentId}`,
      `A client user submitted a reupload for Doc #${request.documentId}. Pending auditor verification.`,
    );

    return { message: 'Reupload submitted for review', status: 'SUBMITTED' };
  }

  // ---------- Branch (BranchDesk) Reupload APIs ----------

  /**
   * List reupload requests for branch user (targetRole = BRANCH)
   */
  async branchListReuploadRequests(
    user: ReqUser,
    filters?: Record<string, string>,
  ) {
    this.assertRole(user, ['CLIENT']);
    const branchId = user.branchIds?.[0];
    if (!branchId) throw new ForbiddenException('Branch user missing branchId');

    const qb = this.reuploadReqRepo
      .createQueryBuilder('req')
      .where('req.unitId = :unitId', { unitId: String(branchId) })
      .andWhere('req.targetRole = :role', { role: 'BRANCH' });

    if (filters?.status) {
      qb.andWhere('req.status = :status', { status: filters.status });
    }

    qb.orderBy('req.createdAt', 'DESC');

    const data = await qb.getMany();
    return { data };
  }

  /**
   * Upload corrected file for a branch reupload request
   */
  async branchReuploadFile(
    user: ReqUser,
    requestId: string,
    file: Express.Multer.File,
  ) {
    this.assertRole(user, ['CLIENT']);
    const branchId = user.branchIds?.[0];
    if (!branchId) throw new ForbiddenException('Branch user missing branchId');

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Reupload request not found');

    if (
      request.targetRole !== 'BRANCH' ||
      String(request.unitId) !== String(branchId)
    ) {
      throw new ForbiddenException('Not your request');
    }
    if (request.status !== 'OPEN') {
      throw new BadRequestException('Request is not open');
    }

    const originalDoc = await this.evidence.findOne({
      where: { id: Number(request.documentId) },
    });
    if (!originalDoc)
      throw new NotFoundException('Original document not found');

    const currentVersion = await this.versionRepo.count({
      where: {
        documentId: originalDoc.id,
        documentType: 'COMPLIANCE_EVIDENCE',
      },
    });

    const newVersion = this.versionRepo.create({
      documentId: originalDoc.id,
      documentType: 'COMPLIANCE_EVIDENCE',
      versionNo: currentVersion + 1,
      filePath: file.path.replace(/\\/g, '/'),
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      uploadedByRole: 'BRANCH',
      uploadedByUserId: user.userId,
      reuploadRequestId: requestId,
    });
    await this.versionRepo.save(newVersion);

    await this.evidence.update(
      { id: originalDoc.id },
      {
        filePath: file.path.replace(/\\/g, '/'),
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
      },
    );

    return { message: 'File uploaded', versionId: newVersion.id };
  }

  /**
   * Submit branch reupload for auditor re-verification
   */
  async branchSubmitReupload(user: ReqUser, requestId: string) {
    this.assertRole(user, ['CLIENT']);
    const branchId = user.branchIds?.[0];
    if (!branchId) throw new ForbiddenException('Branch user missing branchId');

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Reupload request not found');

    if (
      request.targetRole !== 'BRANCH' ||
      String(request.unitId) !== String(branchId)
    ) {
      throw new ForbiddenException('Not your request');
    }
    if (request.status !== 'OPEN') {
      throw new BadRequestException('Request is not open');
    }

    const versionExists = await this.versionRepo.findOne({
      where: { reuploadRequestId: requestId },
    });
    if (!versionExists) {
      throw new BadRequestException('Please upload file before submitting');
    }

    await this.reuploadReqRepo.update(
      { id: requestId },
      { status: 'SUBMITTED', submittedAt: new Date() },
    );

    // Notify the auditor who requested the reupload
    if (request.requestedByUserId) {
      try {
        await this.notifications.createTicket(user.userId, 'CLIENT', {
          queryType: 'COMPLIANCE',
          subject: `Reupload Submitted — Doc #${request.documentId}`,
          message: `A branch user has re-uploaded a document and it is ready for your review.`,
          clientId: request.clientId ? String(request.clientId) : undefined,
        });
      } catch (e) {
        this.logger.warn(
          'notification failure (non-blocking)',
          (e as Error)?.message,
        );
      }

      const auditor = await this.users.findOne({
        where: { id: request.requestedByUserId },
      });
      if (auditor?.email) {
        await this.email
          .send(
            auditor.email,
            `Reupload Submitted — Doc #${request.documentId}`,
            'Reupload Submitted for Verification',
            'A branch user has re-uploaded a corrected document. Please log in to verify.',
          )
          .catch((e) =>
            this.logger.warn('email send failed (non-blocking)', e?.message),
          );
      }
    }

    // Notify CRM about submission
    await this.notifyCrmReuploadEvent(
      user.userId,
      'CLIENT',
      request,
      `Reupload Submitted (BRANCH) — Doc #${request.documentId}`,
      `A branch user submitted a reupload for Doc #${request.documentId}. Pending auditor verification.`,
    );

    return { message: 'Reupload submitted for review', status: 'SUBMITTED' };
  }

  /**
   * Mark a branch reupload request as Not Applicable with remarks
   */
  async branchMarkReuploadNotApplicable(
    user: ReqUser,
    requestId: string,
    remarks: string,
  ) {
    this.assertRole(user, ['CLIENT']);
    if (!remarks || !remarks.trim()) {
      throw new BadRequestException('Remarks are required');
    }

    const branchId = user.branchIds?.[0];
    if (!branchId) throw new ForbiddenException('Branch user missing branchId');

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Reupload request not found');

    if (
      request.targetRole !== 'BRANCH' ||
      String(request.unitId) !== String(branchId)
    ) {
      throw new ForbiddenException('Not your request');
    }
    if (request.status !== 'OPEN') {
      throw new BadRequestException('Request is not open');
    }

    await this.reuploadReqRepo.update(
      { id: requestId },
      {
        status: 'NOT_APPLICABLE',
        crmRemarks: `[NOT APPLICABLE] ${remarks.trim()}`,
        submittedAt: new Date(),
      },
    );

    return { message: 'Marked as Not Applicable', status: 'NOT_APPLICABLE' };
  }

  // ---------- Contractor Reupload APIs ----------

  /**
   * List reupload requests for logged-in contractor
   */
  async contractorListReuploadRequests(
    user: ReqUser,
    filters?: Record<string, string>,
  ) {
    this.assertRole(user, ['CONTRACTOR']);

    const qb = this.reuploadReqRepo
      .createQueryBuilder('req')
      .where('req.contractorUserId = :uid', { uid: user.userId })
      .andWhere('req.targetRole = :role', { role: 'CONTRACTOR' });

    if (filters?.status) {
      qb.andWhere('req.status = :status', { status: filters.status });
    }

    qb.orderBy('req.createdAt', 'DESC');

    const data = await qb.getMany();
    return { data };
  }

  /**
   * Get remarks visible to contractor for a document
   */
  async contractorGetDocRemarks(user: ReqUser, docId: string) {
    this.assertRole(user, ['CONTRACTOR']);

    const doc = await this.getEvidenceWithTaskOrThrow(docId);

    // Ensure contractor is assigned to this task
    if (String(doc.task.assignedToUserId) !== String(user.userId)) {
      throw new ForbiddenException('Not your document');
    }

    const remarks = await this.remarkRepo.find({
      where: {
        documentId: doc.id,
        documentType: 'COMPLIANCE_EVIDENCE',
        visibility: In(['CONTRACTOR_VISIBLE', 'BOTH_VISIBLE']),
      },
      order: { createdAt: 'DESC' },
    });

    return { data: remarks };
  }

  /**
   * Upload file in response to reupload request
   */
  async contractorReuploadFile(
    user: ReqUser,
    requestId: string,
    file: Express.Multer.File,
  ) {
    this.assertRole(user, ['CONTRACTOR']);

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('Reupload request not found');
    }

    if (String(request.contractorUserId) !== String(user.userId)) {
      throw new ForbiddenException('Not your request');
    }

    if (request.status !== 'OPEN') {
      throw new BadRequestException('Request is not open');
    }

    // Get original document
    const originalDoc = await this.evidence.findOne({
      where: { id: Number(request.documentId) },
    });

    if (!originalDoc) {
      throw new NotFoundException('Original document not found');
    }

    // Save new version
    const currentVersion = await this.versionRepo.count({
      where: {
        documentId: originalDoc.id,
        documentType: 'COMPLIANCE_EVIDENCE',
      },
    });

    const newVersion = this.versionRepo.create({
      documentId: originalDoc.id,
      documentType: 'COMPLIANCE_EVIDENCE',
      versionNo: currentVersion + 1,
      filePath: file.path.replace(/\\/g, '/'),
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      uploadedByRole: 'CONTRACTOR',
      uploadedByUserId: user.userId,
      reuploadRequestId: requestId,
    });

    await this.versionRepo.save(newVersion);

    // Update evidence record with new file
    await this.evidence.update(
      { id: originalDoc.id },
      {
        filePath: file.path.replace(/\\/g, '/'),
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
      },
    );

    return { message: 'File uploaded', versionId: newVersion.id };
  }

  /**
   * Submit reupload (mark as submitted for CRM review)
   */
  async contractorSubmitReupload(user: ReqUser, requestId: string) {
    this.assertRole(user, ['CONTRACTOR']);

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('Reupload request not found');
    }

    if (String(request.contractorUserId) !== String(user.userId)) {
      throw new ForbiddenException('Not your request');
    }

    if (request.status !== 'OPEN') {
      throw new BadRequestException('Request is not open');
    }

    // Check if file was uploaded
    const versionExists = await this.versionRepo.findOne({
      where: { reuploadRequestId: requestId },
    });

    if (!versionExists) {
      throw new BadRequestException('Please upload file before submitting');
    }

    await this.reuploadReqRepo.update(
      { id: requestId },
      {
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    );

    // Notify the auditor who requested the reupload
    if (request.requestedByUserId) {
      try {
        await this.notifications.createTicket(user.userId, 'CONTRACTOR', {
          queryType: 'COMPLIANCE',
          subject: `Reupload Submitted — Doc #${request.documentId}`,
          message: `A contractor has re-uploaded a document for reupload request and it is ready for your review.`,
          clientId: request.clientId ? String(request.clientId) : undefined,
        });
      } catch (e) {
        this.logger.warn(
          'notification failure (non-blocking)',
          (e as Error)?.message,
        );
      }

      const auditor = await this.users.findOne({
        where: { id: request.requestedByUserId },
      });
      if (auditor?.email) {
        await this.email
          .send(
            auditor.email,
            `Reupload Submitted — Doc #${request.documentId}`,
            'Reupload Submitted for Verification',
            'A contractor has re-uploaded a corrected document. Please log in to verify.',
          )
          .catch((e) =>
            this.logger.warn('email send failed (non-blocking)', e?.message),
          );
      }
    }

    // Notify CRM about submission
    await this.notifyCrmReuploadEvent(
      user.userId,
      'CONTRACTOR',
      request,
      `Reupload Submitted (CONTRACTOR) — Doc #${request.documentId}`,
      `A contractor submitted a reupload for Doc #${request.documentId}. Pending auditor verification.`,
    );

    return { message: 'Reupload submitted for review', status: 'SUBMITTED' };
  }

  // ---------- Auditor: Create Reupload Requests ----------
  async createReuploadRequestsFromAuditor(
    user: ReqUser,
    dto: { taskId: string; items: { docId: string; remarks: string }[] },
  ) {
    this.assertRole(user, ['AUDITOR']);

    const taskIdNum = Number(dto.taskId);
    const task = await this.tasks.findOne({ where: { id: taskIdNum } });
    if (!task) throw new NotFoundException('Task not found');

    // Ensure auditor is assigned to this client
    await this.assertAuditorAssignedToClient(
      user.userId,
      String(task.clientId),
    );

    const created: DocumentReuploadRequest[] = [];
    for (const item of dto.items) {
      const evidenceId = Number(item.docId);

      // Verify evidence belongs to this task
      const evidence = await this.evidence.findOne({
        where: { id: evidenceId, taskId: taskIdNum },
      });
      if (!evidence) {
        throw new BadRequestException(
          `Evidence #${item.docId} not found for task #${dto.taskId}`,
        );
      }

      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 7); // 7-day SLA

      const req = this.reuploadReqRepo.create({
        documentId: evidenceId,
        documentType: 'COMPLIANCE_EVIDENCE',
        clientId: String(task.clientId),
        unitId: task.branchId ? String(task.branchId) : null,
        contractorUserId: task.assignedToUserId
          ? String(task.assignedToUserId)
          : null,
        targetRole: 'CONTRACTOR',
        requestedByRole: 'AUDITOR',
        requestedByUserId: String(user.userId),
        reason: item.remarks.substring(0, 200),
        remarksVisible: item.remarks,
        status: 'OPEN',
        deadlineDate: deadline,
      });
      created.push(await this.reuploadReqRepo.save(req));
    }

    // Notify assigned contractor
    if (task.assignedToUserId) {
      try {
        await this.notifications.createTicket(user.userId, 'AUDITOR', {
          queryType: 'COMPLIANCE',
          subject: `Reupload Required — Task #${taskIdNum}`,
          message: `An auditor has requested re-upload of ${created.length} document(s) for compliance task #${taskIdNum}. Please review and upload corrected files within 7 days.`,
          clientId: task.clientId ? String(task.clientId) : undefined,
          branchId: task.branchId ? String(task.branchId) : undefined,
        });
      } catch (e) {
        this.logger.warn(
          'notification failure (non-blocking)',
          (e as Error)?.message,
        );
      }

      const contractor = await this.users.findOne({
        where: { id: task.assignedToUserId },
      });
      if (contractor?.email) {
        await this.email
          .send(
            contractor.email,
            `Reupload Required — Task #${taskIdNum}`,
            'Document Reupload Required',
            `An auditor has requested you to re-upload ${created.length} document(s). Please log in and complete the reupload within 7 days.`,
          )
          .catch((e) =>
            this.logger.warn('email send failed (non-blocking)', e?.message),
          );
      }
    }

    // Notify CRM about new reupload requests
    for (const reqRow of created) {
      await this.notifyCrmReuploadEvent(
        String(user.userId),
        'AUDITOR',
        reqRow,
        `Reupload Issued — Doc #${reqRow.documentId}`,
        `Auditor issued reupload request (${reqRow.targetRole}) for ${reqRow.documentType || 'document'}. Deadline: ${reqRow.deadlineDate?.toISOString()?.slice(0, 10) || 'N/A'}.`,
      );
    }

    return { created: created.length, ids: created.map((r) => r.id) };
  }

  // ---------- Auditor: List Reupload Requests for Re-verification ----------
  async auditorListReuploadRequests(user: ReqUser, q: Record<string, string>) {
    this.assertRole(user, ['AUDITOR']);

    const assignedClients =
      await this.assignmentsService.getAssignedClientsForAuditor(user.userId);
    const clientIds = assignedClients.map((c) => c.id);

    if (!clientIds.length) return { data: [] };

    const qb = this.reuploadReqRepo
      .createQueryBuilder('r')
      .where('r.clientId IN (:...clientIds)', { clientIds });

    // Status filter with overdue/dueSoon virtual filters
    const today = new Date().toISOString().slice(0, 10);
    const dueSoonDate = new Date();
    dueSoonDate.setDate(dueSoonDate.getDate() + 3);
    const dueSoonStr = dueSoonDate.toISOString().slice(0, 10);

    if (q?.status === 'OVERDUE') {
      qb.andWhere('r.status IN (:...activeStatuses)', {
        activeStatuses: ['OPEN', 'SUBMITTED'],
      });
      qb.andWhere('r.deadlineDate < :today', { today });
    } else if (q?.status === 'DUE_SOON') {
      qb.andWhere('r.status IN (:...activeStatuses)', {
        activeStatuses: ['OPEN', 'SUBMITTED'],
      });
      qb.andWhere('r.deadlineDate >= :today', { today });
      qb.andWhere('r.deadlineDate <= :dueSoon', { dueSoon: dueSoonStr });
    } else if (q?.status) {
      qb.andWhere('r.status = :status', { status: q.status });
    } else {
      qb.andWhere('r.status = :status', { status: 'SUBMITTED' });
    }

    if (q?.clientId) {
      qb.andWhere('r.clientId = :cid', { cid: String(q.clientId) });
    }

    qb.orderBy('r.deadlineDate', 'ASC').addOrderBy('r.submittedAt', 'DESC');

    const data = await qb.getMany();

    // Enrich with document info
    const enriched = await Promise.all(
      data.map(async (r) => {
        const evidence = await this.evidence.findOne({
          where: { id: Number(r.documentId) },
        });
        const latestVersion = await this.versionRepo.findOne({
          where: { reuploadRequestId: r.id },
          order: { versionNo: 'DESC' },
        });
        // SLA computation
        const deadlineDate = r.deadlineDate ? new Date(r.deadlineDate) : null;
        const nowDate = new Date();
        const daysLeft = deadlineDate
          ? Math.ceil(
              (deadlineDate.getTime() - nowDate.getTime()) /
                (1000 * 60 * 60 * 24),
            )
          : null;
        const isOverdue = daysLeft !== null && daysLeft < 0;
        const isDueSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;

        return {
          ...r,
          documentName: evidence?.fileName || `Document #${r.documentId}`,
          deadlineDate: r.deadlineDate,
          daysLeft,
          isOverdue,
          isDueSoon,
          latestUpload: latestVersion
            ? {
                versionId: latestVersion.id,
                fileName: latestVersion.fileName,
                filePath: latestVersion.filePath,
                uploadedAt: latestVersion.uploadedAt,
              }
            : null,
        };
      }),
    );

    return { data: enriched };
  }

  // ---------- Auditor: Approve Reupload (close request) ----------
  async auditorApproveReupload(
    user: ReqUser,
    requestId: string,
    remarks?: string,
  ) {
    this.assertRole(user, ['AUDITOR']);

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Reupload request not found');

    // Verify auditor is assigned to this client
    await this.assertAuditorAssignedToClient(
      user.userId,
      String(request.clientId),
    );

    if (request.status !== 'SUBMITTED') {
      throw new BadRequestException('Only SUBMITTED requests can be approved');
    }

    await this.reuploadReqRepo.update(
      { id: requestId },
      {
        status: 'REVERIFIED',
        reverifiedAt: new Date(),
        reverifiedByUserId: String(user.userId),
        crmRemarks: remarks || 'Approved by auditor',
      },
    );

    // Check if all reupload requests for this document's task are resolved
    // to update the task status
    const evidence = await this.evidence.findOne({
      where: { id: Number(request.documentId) },
    });
    if (evidence?.taskId) {
      await this.syncTaskStatusAfterReupload(evidence.taskId, user.userId);
    }

    // Notify contractor of approval
    if (request.contractorUserId) {
      try {
        await this.notifications.createTicket(user.userId, 'AUDITOR', {
          queryType: 'COMPLIANCE',
          subject: `Reupload Approved — Doc #${request.documentId}`,
          message: `Your re-uploaded document has been approved by the auditor.`,
          clientId: request.clientId ? String(request.clientId) : undefined,
        });
      } catch (e) {
        this.logger.warn(
          'notification failure (non-blocking)',
          (e as Error)?.message,
        );
      }

      const contractor = await this.users.findOne({
        where: { id: request.contractorUserId },
      });
      if (contractor?.email) {
        await this.email
          .send(
            contractor.email,
            `Reupload Approved — Doc #${request.documentId}`,
            'Re-uploaded Document Approved',
            'Your re-uploaded document has been verified and approved by the auditor.',
          )
          .catch((e) =>
            this.logger.warn('email send failed (non-blocking)', e?.message),
          );
      }
    }

    // CRM visibility
    await this.notifyCrmReuploadEvent(
      String(user.userId),
      'AUDITOR',
      request,
      `Reupload Verified — Doc #${request.documentId}`,
      `Auditor verified reupload for ${request.targetRole} (Doc #${request.documentId}).`,
    );

    return { status: 'REVERIFIED', message: 'Reupload approved' };
  }

  // ---------- Auditor: Reject Reupload (re-open for contractor) ----------
  async auditorRejectReupload(
    user: ReqUser,
    requestId: string,
    remarks: string,
  ) {
    this.assertRole(user, ['AUDITOR']);

    if (!remarks?.trim()) {
      throw new BadRequestException('Remarks are required for rejection');
    }

    const request = await this.reuploadReqRepo.findOne({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Reupload request not found');

    await this.assertAuditorAssignedToClient(
      user.userId,
      String(request.clientId),
    );

    if (request.status !== 'SUBMITTED') {
      throw new BadRequestException('Only SUBMITTED requests can be rejected');
    }

    await this.reuploadReqRepo.update(
      { id: requestId },
      {
        status: 'REJECTED',
        reverifiedAt: new Date(),
        reverifiedByUserId: String(user.userId),
        crmRemarks: remarks.trim(),
      },
    );

    // Create a new OPEN request so contractor can re-upload (with 7-day SLA)
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7);

    const newReq = this.reuploadReqRepo.create({
      documentId: request.documentId,
      documentType: request.documentType,
      clientId: request.clientId,
      unitId: request.unitId,
      contractorUserId: request.contractorUserId,
      targetRole: request.targetRole,
      requestedByRole: 'AUDITOR',
      requestedByUserId: String(user.userId),
      reason: remarks.trim().substring(0, 200),
      remarksVisible: remarks.trim(),
      status: 'OPEN',
      deadlineDate: deadline,
    });
    const saved = await this.reuploadReqRepo.save(newReq);

    // Notify contractor of rejection
    if (request.contractorUserId) {
      try {
        await this.notifications.createTicket(user.userId, 'AUDITOR', {
          queryType: 'COMPLIANCE',
          subject: `Reupload Rejected — Doc #${request.documentId}`,
          message: `Your re-uploaded document was rejected. Reason: ${remarks.trim()}. Please upload a corrected version within 7 days.`,
          clientId: request.clientId ? String(request.clientId) : undefined,
        });
      } catch (e) {
        this.logger.warn(
          'notification failure (non-blocking)',
          (e as Error)?.message,
        );
      }

      const contractor = await this.users.findOne({
        where: { id: request.contractorUserId },
      });
      if (contractor?.email) {
        await this.email
          .send(
            contractor.email,
            `Reupload Rejected — Doc #${request.documentId}`,
            'Re-uploaded Document Rejected',
            `Your re-uploaded document was rejected: ${remarks.trim()}. Please upload a corrected version.`,
          )
          .catch((e) =>
            this.logger.warn('email send failed (non-blocking)', e?.message),
          );
      }
    }

    // CRM visibility
    await this.notifyCrmReuploadEvent(
      String(user.userId),
      'AUDITOR',
      saved,
      `Reupload Rejected — Doc #${request.documentId}`,
      `Auditor rejected reupload for ${request.targetRole} (Doc #${request.documentId}). Remarks: ${remarks.trim()}`,
    );

    return {
      status: 'REJECTED',
      message: 'Reupload rejected — new request created for contractor',
      newRequestId: saved.id,
    };
  }

  // ---------- Helper: CRM Reupload Notification ----------
  private async notifyCrmReuploadEvent(
    actorUserId: string,
    actorRole: string,
    request: DocumentReuploadRequest,
    subject: string,
    message: string,
  ): Promise<void> {
    try {
      await this.notifications.createTicket(actorUserId, actorRole, {
        queryType: 'COMPLIANCE',
        subject,
        message,
        clientId: request.clientId ? String(request.clientId) : undefined,
      });
    } catch (e) {
      this.logger.warn(
        'notification failure (non-blocking)',
        (e as Error)?.message,
      );
    }
  }

  // ---------- Helper: Sync task status after reupload decisions ----------
  private async syncTaskStatusAfterReupload(
    taskId: number,
    approverUserId?: string,
  ) {
    // Find all reupload requests linked to evidence of this task
    const taskEvidence = await this.evidence.find({
      where: { taskId },
      select: ['id'],
    });
    if (!taskEvidence.length) return;

    const evidenceIds = taskEvidence.map((e) => e.id);

    const openRequests = await this.reuploadReqRepo
      .createQueryBuilder('r')
      .where('r.documentId IN (:...ids)', { ids: evidenceIds })
      .andWhere('r.documentType = :dt', { dt: 'COMPLIANCE_EVIDENCE' })
      .andWhere('r.status IN (:...statuses)', {
        statuses: ['OPEN', 'SUBMITTED'],
      })
      .getCount();

    if (openRequests === 0) {
      // All reupload requests resolved — mark task as APPROVED
      const task = await this.tasks.findOne({ where: { id: taskId } });
      if (
        task &&
        (task.status === 'SUBMITTED' || task.status === 'IN_PROGRESS')
      ) {
        await this.tasks.update(
          { id: taskId },
          {
            status: 'APPROVED',
            approvedByUserId: approverUserId ?? null,
            approvedAt: new Date(),
          },
        );
        if (task.branchId) {
          this.riskCache
            .invalidateBranch(task.branchId)
            .catch((e) =>
              this.logger.warn('riskCache invalidation failed', e?.message),
            );
        }
      }
    }
  }

  /* ═══════ CRM Reupload Backlog — list + top overdue units ═══════ */

  async getCrmAssignedClientIds(userId: string): Promise<string[]> {
    const clients =
      await this.assignmentsService.getAssignedClientsForCrm(userId);
    return clients.map((c) => c.id);
  }

  async crmListReuploadRequests(user: ReqUser, q: Record<string, string>) {
    const clientIds = await this.getCrmAssignedClientIds(user.id);
    if (!clientIds?.length) return { items: [], total: 0, page: 1, limit: 25 };

    const page = Math.max(1, Number(q?.page || 1));
    const limit = Math.min(100, Math.max(10, Number(q?.limit || 25)));
    const skip = (page - 1) * limit;

    const status =
      q?.status && q.status !== 'ALL' ? String(q.status) : undefined;
    const targetRole =
      q?.targetRole && q.targetRole !== 'ALL'
        ? String(q.targetRole)
        : undefined;
    const search = (q?.q || '').trim();

    const overdue = String(q?.overdue || '') === 'true';
    const dueSoon = String(q?.dueSoon || '') === 'true';
    const slaDays = Math.max(
      1,
      Number(q?.slaDays || (status === 'SUBMITTED' ? 1 : 2)),
    );

    const now = new Date();
    const cutoff = new Date(now.getTime() - slaDays * 24 * 60 * 60 * 1000);

    const builder = this.reuploadReqRepo
      .createQueryBuilder('r')
      .where('r.clientId IN (:...clientIds)', { clientIds });

    if (status) builder.andWhere('r.status = :status', { status });
    if (targetRole)
      builder.andWhere('r.targetRole = :targetRole', { targetRole });
    if (q?.unitId) builder.andWhere('r.unitId = :unitId', { unitId: q.unitId });
    if (q?.clientId) builder.andWhere('r.clientId = :cId', { cId: q.clientId });

    // Overdue / Due soon based on updatedAt
    if (overdue) {
      builder.andWhere('r.updatedAt < :cutoff', { cutoff });
    }
    if (dueSoon && !overdue) {
      const soonFrom = new Date(
        now.getTime() - (slaDays - 0.5) * 24 * 60 * 60 * 1000,
      );
      builder.andWhere('r.updatedAt BETWEEN :soonFrom AND :now', {
        soonFrom,
        now,
      });
    }

    // Server-side search
    if (search) {
      builder.andWhere(
        `(CAST(r.document_id AS text) ILIKE :s
          OR COALESCE(r.document_type,'') ILIKE :s
          OR COALESCE(r.reason,'') ILIKE :s
          OR COALESCE(r.remarks_visible,'') ILIKE :s
          OR COALESCE(r.target_role,'') ILIKE :s)`,
        { s: `%${search}%` },
      );
    }

    builder.orderBy('r.updatedAt', 'DESC').skip(skip).take(limit);

    const [rows, total] = await builder.getManyAndCount();

    // Enrich with client + branch names
    const branchIds = [
      ...new Set(rows.filter((r) => r.unitId).map((r) => r.unitId!)),
    ];
    const clientIdsUsed = [...new Set(rows.map((r) => r.clientId))];

    let branchMap: Record<string, string> = {};
    if (branchIds.length) {
      const bRows = await this.branches.find({ where: { id: In(branchIds) } });
      branchMap = Object.fromEntries(
        bRows.map((b) => [b.id, b.branchName || 'N/A']),
      );
    }

    let clientMap: Record<string, string> = {};
    if (clientIdsUsed.length) {
      const cRows = await this.reuploadReqRepo.manager.query(
        `SELECT id, client_name AS "clientName" FROM clients WHERE id = ANY($1)`,
        [clientIdsUsed],
      );
      clientMap = Object.fromEntries(
        cRows.map((c: { id: string; clientName: string }) => [
          c.id,
          c.clientName,
        ]),
      );
    }

    const items = rows.map((r) => ({
      ...r,
      clientName: clientMap[r.clientId] || 'N/A',
      unitName: r.unitId ? branchMap[r.unitId] || 'N/A' : 'Client Master',
    }));

    return { items, total, page, limit };
  }

  async crmTopOverdueReuploadUnits(user: ReqUser, q: Record<string, string>) {
    const clientIds = await this.getCrmAssignedClientIds(user.id);
    if (!clientIds?.length) return [];

    const slaDays = Math.max(1, Number(q?.slaDays || 2));
    const now = new Date();
    const cutoff = new Date(now.getTime() - slaDays * 24 * 60 * 60 * 1000);

    const rows = await this.reuploadReqRepo
      .createQueryBuilder('r')
      .select('r.unit_id', 'unitId')
      .addSelect('COUNT(*)::int', 'count')
      .addSelect(
        `SUM(CASE WHEN r.status='OPEN' THEN 1 ELSE 0 END)::int`,
        'open',
      )
      .addSelect(
        `SUM(CASE WHEN r.status='SUBMITTED' THEN 1 ELSE 0 END)::int`,
        'submitted',
      )
      .where('r.clientId IN (:...clientIds)', { clientIds })
      .andWhere('r.status IN (:...sts)', { sts: ['OPEN', 'SUBMITTED'] })
      .andWhere('r.updatedAt < :cutoff', { cutoff })
      .groupBy('r.unit_id')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    // Enrich unit names
    const unitIds = rows
      .filter((r: { unitId: string | null }) => r.unitId)
      .map((r: { unitId: string | null }) => r.unitId);
    let unitMap: Record<string, string> = {};
    if (unitIds.length) {
      const bRows = await this.branches.find({ where: { id: In(unitIds) } });
      unitMap = Object.fromEntries(
        bRows.map((b) => [b.id, b.branchName || 'N/A']),
      );
    }

    return rows.map(
      (x: {
        unitId: string | null;
        count: string;
        open: string;
        submitted: string;
      }) => ({
        unitId: x.unitId || null,
        unitName: x.unitId
          ? unitMap[x.unitId] || 'N/A'
          : 'Client Master (no unit)',
        count: Number(x.count || 0),
        open: Number(x.open || 0),
        submitted: Number(x.submitted || 0),
      }),
    );
  }
}
