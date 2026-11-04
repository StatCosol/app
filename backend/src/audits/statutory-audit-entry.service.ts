import { AuditType } from '../common/enums';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';
import { AuditEntity } from './entities/audit.entity';
import {
  ConfigureAuditEntryDto,
  ReviewAuditEntryDocumentDto,
  SaveAuditEntryDto,
} from './dto/statutory-audit-entry.dto';
import {
  CATALOGUE_VERSION,
  ENTRY_CATEGORIES,
  ENTRY_TYPES,
  MISSING_FACTORY_CATEGORIES,
  EntryItem,
  entryScore,
} from './statutory-audit-entry.catalogue';

@Injectable()
export class StatutoryAuditEntryService {
  constructor(
    private readonly ds: DataSource,
    private readonly access: AccessScopeService,
  ) {}

  async assignments(user: ReqUser) {
    if (user.roleCode !== 'AUDITOR')
      throw new ForbiddenException('Auditor access only');
    const audits = await this.ds.manager.find(AuditEntity, {
      where: { assignedAuditorId: user.userId },
      relations: ['client', 'branch', 'contractorUser', 'assignedAuditor'],
      order: { createdAt: 'DESC' },
    });
    return audits.map((a) => ({
      id: a.id,
      auditCode: a.auditCode,
      clientId: a.clientId,
      clientName: a.client?.clientName,
      branchId: a.branchId,
      branchName: a.branch?.branchName,
      contractorId: a.contractorUserId,
      contractorName: a.contractorUser?.name,
      auditType: a.auditType,
      periodCode: a.periodCode,
      status: a.status,
      auditorName: a.assignedAuditor?.name,
    }));
  }

  catalogue() {
    return {
      version: CATALOGUE_VERSION,
      types: ENTRY_TYPES,
      categories: ENTRY_CATEGORIES.map((c) => ({
        name: c.name,
        count: c.items.length,
      })),
      missingCategories: MISSING_FACTORY_CATEGORIES,
    };
  }

  private async audit(
    user: ReqUser,
    id: string,
    em = this.ds.manager,
    write = false,
  ) {
    if (user.roleCode !== 'AUDITOR')
      throw new ForbiddenException('Auditor access only');
    const audit = await em.findOne(AuditEntity, {
      where: { id },
      ...(write ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!audit) throw new NotFoundException('Audit not found');
    if (audit.assignedAuditorId !== user.userId)
      throw new ForbiddenException('Not your audit');
    if (write && !['PLANNED', 'IN_PROGRESS'].includes(audit.status))
      throw new ConflictException('This audit is read-only after submission');
    if (write) await this.assertReportEditable(id, em);
    return audit;
  }

  private async assertReportEditable(id: string, em: EntityManager) {
    const [report] = await em.query(
      'SELECT status,held_at FROM audit_reports WHERE audit_id=$1 ORDER BY updated_at DESC LIMIT 1',
      [id],
    );
    if (report && (report.status !== 'DRAFT' || report.held_at))
      throw new ConflictException(
        'The audit report is locked for review; contact the audit manager',
      );
  }

  private async session(id: string, em = this.ds.manager) {
    const [session] = await em.query(
      'SELECT * FROM audit_entry_sessions WHERE audit_id=$1',
      [id],
    );
    if (session && session.catalogue_version !== CATALOGUE_VERSION)
      throw new ConflictException(
        'Checklist version changed; contact your administrator',
      );
    return session;
  }

  private items(session: any): EntryItem[] {
    return ENTRY_CATEGORIES.filter((c) =>
      session.categories.includes(c.name),
    ).flatMap((c) => c.items);
  }

  private async editable(
    user: ReqUser,
    id: string,
    em: EntityManager,
    itemId?: string,
  ) {
    await this.audit(user, id, em, true);
    const session = await this.session(id, em);
    if (!session) throw new BadRequestException('Choose the audit scope first');
    if (session.submitted_at)
      throw new ConflictException('Audit entry already submitted');
    const item = itemId
      ? this.items(session).find((i) => i.id === itemId)
      : undefined;
    if (itemId && !item)
      throw new BadRequestException('Point is outside this audit scope');
    return { session, item };
  }

  async configure(user: ReqUser, id: string, dto: ConfigureAuditEntryDto) {
    return this.ds.transaction(async (em) => {
      const audit = await this.audit(user, id, em, true);
      if (audit.auditType !== AuditType.FACTORY || audit.contractorUserId)
        throw new BadRequestException('This master is for Factory audits only');
      if (!['PHYSICAL', 'ONLINE'].includes(dto.auditMode))
        throw new BadRequestException('Choose Physical or Online/Virtual');
      if (
        dto.unitType !== 'FACTORY' ||
        dto.scopeAcknowledged !== true ||
        !dto.auditeeName?.trim() ||
        !dto.categories?.length ||
        dto.categories.some(
          (n) => !ENTRY_CATEGORIES.some((c) => c.name === n),
        ) ||
        new Set(dto.categories).size !== dto.categories.length
      )
        throw new BadRequestException(
          'Select a valid scope, auditee and scope acknowledgement',
        );
      const existing = await this.session(id, em);
      if (existing)
        throw new ConflictException(
          'Audit scope is already configured and cannot be replaced',
        );
      await em.query(
        `INSERT INTO audit_entry_sessions(audit_id,catalogue_version,unit_type,auditee_name,categories,scope_acknowledged,audit_mode) VALUES($1,$2,$3,$4,$5::jsonb,true,$6)`,
        [
          id,
          CATALOGUE_VERSION,
          dto.unitType,
          dto.auditeeName.trim(),
          JSON.stringify(dto.categories),
          dto.auditMode,
        ],
      );
      await em.update(AuditEntity, id, { status: 'IN_PROGRESS' });
      return { configured: true };
    });
  }

  async read(user: ReqUser, id: string) {
    const audit = await this.audit(user, id);
    const session = await this.session(id);
    if (!session)
      return {
        session: null,
        items: [],
        answers: [],
        evidence: [],
        documents: [],
        auditStatus: audit.status,
      };
    const answers = await this.ds.query(
      'SELECT * FROM audit_entry_answers WHERE audit_id=$1 ORDER BY item_id',
      [id],
    );
    const evidence = await this.ds.query(
      'SELECT item_id,filename,mime_type,uploaded_at FROM audit_entry_evidence WHERE audit_id=$1',
      [id],
    );
    const items = this.items(session).map((item) => ({
      ...item,
      category: ENTRY_CATEGORIES.find((c) =>
        c.items.some((i) => i.id === item.id),
      )!.name,
    }));
    const documents = await this.latestDocuments(id);
    const markedAnswers = answers.map((a) => ({
      ...a,
      stale:
        session.audit_mode === 'ONLINE' &&
        a.document_token !==
          this.documentToken(documents.find((d) => d.item_id === a.item_id)),
    }));
    return {
      session,
      items,
      answers: markedAnswers,
      evidence,
      documents,
      auditStatus: audit.status,
      score: entryScore(
        items,
        markedAnswers.filter((a) => !a.stale),
      ),
    };
  }

  async save(
    user: ReqUser,
    id: string,
    itemId: string,
    dto: SaveAuditEntryDto,
  ) {
    return this.ds.transaction(async (em) => {
      const { item, session } = await this.editable(user, id, em, itemId);
      if (
        !dto.answer?.trim() ||
        !['COMPLIED', 'NON_COMPLIED', 'NOT_APPLICABLE'].includes(dto.status) ||
        !Number.isInteger(dto.version) ||
        dto.version < 0
      )
        throw new BadRequestException(
          'Answer and compliance status are required',
        );
      if (dto.status !== 'COMPLIED' && !dto.remarks?.trim())
        throw new BadRequestException(
          'Explain non-compliance or non-applicability in remarks',
        );
      if (
        item!.answerOptions?.length &&
        !item!.answerOptions.includes(dto.answer.trim())
      )
        throw new BadRequestException('Select a listed answer');
      const document = (await this.latestDocuments(id, em)).find(
        (d) => d.item_id === itemId,
      );
      if (session.audit_mode === 'ONLINE')
        this.validateDocument(dto.status, document);
      const [existing] = await em.query(
        'SELECT version FROM audit_entry_answers WHERE audit_id=$1 AND item_id=$2',
        [id, itemId],
      );
      if ((existing?.version || 0) !== dto.version)
        throw new ConflictException(
          'This point changed in another session. Reload before saving',
        );
      const [answer] = await em.query(
        `INSERT INTO audit_entry_answers(audit_id,item_id,answer,status,remarks,updated_by,document_token) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(audit_id,item_id) DO UPDATE SET answer=EXCLUDED.answer,status=EXCLUDED.status,remarks=EXCLUDED.remarks,updated_by=EXCLUDED.updated_by,document_token=EXCLUDED.document_token,updated_at=now(),version=audit_entry_answers.version+1 RETURNING *`,
        [
          id,
          itemId,
          dto.answer.trim(),
          dto.status,
          dto.remarks.trim(),
          user.userId,
          session.audit_mode === 'ONLINE' ? this.documentToken(document) : '',
        ],
      );
      return answer;
    });
  }

  async upload(
    user: ReqUser,
    id: string,
    itemId: string,
    file: Express.Multer.File,
  ) {
    return this.ds.transaction(async (em) => {
      await this.editable(user, id, em, itemId);
      const filename = file.originalname
        .replace(/[^a-zA-Z0-9._ -]/g, '_')
        .slice(0, 200);
      await em.query(
        `INSERT INTO audit_entry_evidence(audit_id,item_id,filename,mime_type,content,uploaded_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(audit_id,item_id) DO UPDATE SET filename=EXCLUDED.filename,mime_type=EXCLUDED.mime_type,content=EXCLUDED.content,uploaded_by=EXCLUDED.uploaded_by,uploaded_at=now()`,
        [id, itemId, filename, file.mimetype, file.buffer, user.userId],
      );
      return { item_id: itemId, filename };
    });
  }

  async evidence(user: ReqUser, id: string, itemId: string) {
    await this.audit(user, id);
    const [file] = await this.ds.query(
      'SELECT filename,mime_type,content FROM audit_entry_evidence WHERE audit_id=$1 AND item_id=$2',
      [id, itemId],
    );
    if (!file) throw new NotFoundException('Evidence not found');
    return file;
  }

  async hasSession(id: string) {
    return !!(await this.session(id));
  }

  async submit(user: ReqUser, id: string, finalRemark?: string) {
    return this.ds.transaction(async (em) => {
      const { session } = await this.editable(user, id, em);
      const audit = await em.findOneByOrFail(AuditEntity, { id });
      const items = this.items(session);
      const answers = await em.query(
        'SELECT * FROM audit_entry_answers WHERE audit_id=$1',
        [id],
      );
      if (
        !items.length ||
        items.some((i) => !answers.some((a) => a.item_id === i.id))
      )
        throw new BadRequestException(
          'Save every point in the selected scope before submitting',
        );
      if (session.audit_mode === 'ONLINE') {
        const documents = await this.latestDocuments(id, em);
        for (const answer of answers) {
          const doc = documents.find((d) => d.item_id === answer.item_id);
          this.validateDocument(answer.status, doc);
          if (answer.document_token !== this.documentToken(doc))
            throw new ConflictException(
              'Auditee documents changed. Review and save affected points again',
            );
        }
      }
      const pendingWorkspace = await em.query(
        "SELECT 1 FROM audit_checklist_items WHERE audit_id=$1 AND (status IN ('PENDING','UPLOADED') OR (automated_remarks IS NOT NULL AND NOT automation_reviewed)) LIMIT 1",
        [id],
      );
      if (pendingWorkspace.length)
        throw new BadRequestException(
          'Review the existing workspace checklist and documents before submitting this audit',
        );
      const score = entryScore(items, answers);
      for (const answer of answers.filter((a) => a.status === 'NON_COMPLIED')) {
        const item = items.find((i) => i.id === answer.item_id)!;
        await em.query(
          `INSERT INTO audit_non_compliances(audit_id,entry_item_id,document_name,remark,requested_to_role,requested_to_user_id,status) VALUES($1,$2,$3,$4,$5,$6,'NC_RAISED') ON CONFLICT(audit_id,entry_item_id) WHERE entry_item_id IS NOT NULL DO NOTHING`,
          [
            id,
            item.id,
            item.description.slice(0, 512),
            [item.statute, item.legalProvision, answer.answer, answer.remarks]
              .filter(Boolean)
              .join('\n'),
            audit.contractorUserId ? 'CONTRACTOR' : 'BRANCH',
            audit.contractorUserId,
          ],
        );
      }
      const [nc] = await em.query(
        `SELECT count(*)::int AS count FROM audit_non_compliances WHERE audit_id=$1 AND status NOT IN ('ACCEPTED','CLOSED')`,
        [id],
      );
      const workspaceNcs = await em.query(
        "SELECT 1 FROM audit_checklist_items WHERE audit_id=$1 AND status='NON_COMPLIED' LIMIT 1",
        [id],
      );
      const status =
        nc.count > 0 || workspaceNcs.length > 0
          ? 'CORRECTION_PENDING'
          : 'SUBMITTED';
      await em.query(
        'UPDATE audit_entry_sessions SET submitted_at=now(),updated_at=now() WHERE audit_id=$1',
        [id],
      );
      await em.update(AuditEntity, id, {
        status,
        score: score.percentage,
        scoreCalculatedAt: new Date(),
        submittedAt: new Date(),
        finalRemark: finalRemark?.trim() || null,
      });
      return {
        auditId: id,
        status,
        score: score.percentage,
        completed: answers.length,
        total: items.length,
      };
    });
  }

  private documentToken(document: any) {
    return document ? `${document.id}:${document.review_version}` : '';
  }
  private validateDocument(status: string, document: any) {
    if (document?.review_status === 'PENDING')
      throw new BadRequestException(
        'Review the auditee document before saving this point',
      );
    if (status === 'COMPLIED' && document?.review_status !== 'APPROVED')
      throw new BadRequestException(
        'Online compliance requires an approved auditee document',
      );
  }
  private latestDocuments(id: string, em = this.ds.manager) {
    return em.query(
      `SELECT DISTINCT ON (item_id) id,item_id,revision,filename,mime_type,uploaded_at,review_status,review_remarks,review_version,reviewed_at FROM audit_entry_documents WHERE audit_id=$1 ORDER BY item_id,revision DESC`,
      [id],
    );
  }
  private async auditeeAudit(
    user: ReqUser,
    id: string,
    em = this.ds.manager,
    write = false,
  ) {
    if (!['CLIENT', 'BRANCH_DESK', 'CONTRACTOR'].includes(user.roleCode))
      throw new ForbiddenException('Auditee access only');
    const audit = await em.findOne(AuditEntity, {
      where: { id },
      ...(write ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!audit) throw new NotFoundException('Audit not found');
    if (user.roleCode === 'CONTRACTOR') {
      if (audit.contractorUserId !== user.userId)
        throw new ForbiddenException('Not your audit');
    } else {
      const scope = await this.access.getScope(user);
      if (
        !['client', 'branches'].includes(scope.level) ||
        scope.clientId !== audit.clientId
      )
        throw new ForbiddenException('Audit is outside your company');
      if (
        scope.level === 'branches' &&
        (!audit.branchId || !scope.branchIds?.includes(audit.branchId))
      )
        throw new ForbiddenException('Audit is outside your branch');
    }
    const session = await this.session(id, em);
    if (!session || session.audit_mode !== 'ONLINE')
      throw new ForbiddenException(
        'Auditee document upload is available for Online/Virtual audits only',
      );
    if (write) {
      await this.assertReportEditable(id, em);
      if (
        session.submitted_at ||
        !['PLANNED', 'IN_PROGRESS'].includes(audit.status)
      )
        throw new ConflictException(
          'Audit already submitted; use the correction workflow',
        );
      const today = new Date().toISOString().slice(0, 10);
      if (
        audit.uploadLockFrom &&
        audit.uploadLockUntil &&
        today >= audit.uploadLockFrom &&
        today <= audit.uploadLockUntil
      )
        throw new ConflictException(
          'Document uploads are locked during auditor review',
        );
    }
    return { audit, session };
  }
  async auditeeAssignments(user: ReqUser) {
    const qb = this.ds
      .getRepository(AuditEntity)
      .createQueryBuilder('a')
      .innerJoin(
        'audit_entry_sessions',
        's',
        "s.audit_id=a.id AND s.audit_mode='ONLINE'",
      )
      .leftJoinAndSelect('a.branch', 'branch');
    if (user.roleCode === 'CONTRACTOR')
      qb.where('a.contractorUserId=:uid', { uid: user.userId });
    else if (['CLIENT', 'BRANCH_DESK'].includes(user.roleCode)) {
      const scope = await this.access.getScope(user);
      if (!['client', 'branches'].includes(scope.level))
        throw new ForbiddenException('Auditee access only');
      this.access.applyToQb(qb, scope, {
        clientPath: 'a.clientId',
        branchPath: 'a.branchId',
      });
    } else throw new ForbiddenException('Auditee access only');
    return (await qb.orderBy('a.createdAt', 'DESC').getMany()).map((a) => ({
      id: a.id,
      auditCode: a.auditCode,
      periodCode: a.periodCode,
      branchName: a.branch?.branchName,
      status: a.status,
    }));
  }
  async auditeeRead(user: ReqUser, id: string) {
    const { audit, session } = await this.auditeeAudit(user, id);
    // Auditees see requirements and document-review feedback, not unpublished findings.
    const today = new Date().toISOString().slice(0, 10);
    const uploadLocked = !!(
      audit.uploadLockFrom &&
      audit.uploadLockUntil &&
      today >= audit.uploadLockFrom &&
      today <= audit.uploadLockUntil
    );
    const items = ENTRY_CATEGORIES.filter((c) =>
      session.categories.includes(c.name),
    ).flatMap((c) => c.items.map((item) => ({ ...item, category: c.name })));
    return {
      mode: session.audit_mode,
      auditeeName: session.auditee_name,
      readonly:
        !!session.submitted_at ||
        !['PLANNED', 'IN_PROGRESS'].includes(audit.status),
      uploadLocked,
      items,
      documents: await this.latestDocuments(id),
    };
  }
  async auditeeUpload(
    user: ReqUser,
    id: string,
    itemId: string,
    file: Express.Multer.File,
  ) {
    return this.ds.transaction(async (em) => {
      const { session } = await this.auditeeAudit(user, id, em, true);
      if (!this.items(session).some((i) => i.id === itemId))
        throw new BadRequestException('Point outside audit scope');
      const filename = file.originalname
        .replace(/[^a-zA-Z0-9._ -]/g, '_')
        .slice(0, 200);
      const [row] = await em.query(
        `INSERT INTO audit_entry_documents(audit_id,item_id,revision,filename,mime_type,content,uploaded_by) SELECT $1,$2,COALESCE(MAX(revision),0)+1,$3,$4,$5,$6 FROM audit_entry_documents WHERE audit_id=$1 AND item_id=$2 RETURNING id,item_id,revision,filename,review_status,review_version`,
        [id, itemId, filename, file.mimetype, file.buffer, user.userId],
      );
      return row;
    });
  }
  async reviewDocument(
    user: ReqUser,
    id: string,
    documentId: string,
    dto: ReviewAuditEntryDocumentDto,
  ) {
    return this.ds.transaction(async (em) => {
      await this.editable(user, id, em);
      const document = (await this.latestDocuments(id, em)).find(
        (d) => d.id === documentId,
      );
      if (!document || document.review_version !== dto.version)
        throw new ConflictException(
          'Document changed; refresh before reviewing',
        );
      if (
        !['APPROVED', 'REJECTED'].includes(dto.status) ||
        (dto.status === 'REJECTED' && !dto.remarks?.trim())
      )
        throw new BadRequestException(
          'Explain the reason when requesting re-upload',
        );
      await em.query(
        `UPDATE audit_entry_documents SET review_status=$3,review_remarks=$4,review_version=review_version+1,reviewed_by=$5,reviewed_at=now() WHERE audit_id=$1 AND id=$2`,
        [id, documentId, dto.status, dto.remarks.trim(), user.userId],
      );
      return {
        item_id: document.item_id,
        status: dto.status,
        version: document.review_version + 1,
      };
    });
  }
  async documentFile(user: ReqUser, id: string, documentId: string) {
    if (user.roleCode === 'AUDITOR') await this.audit(user, id);
    else await this.auditeeAudit(user, id);
    const [file] = await this.ds.query(
      'SELECT filename,mime_type,content FROM audit_entry_documents WHERE audit_id=$1 AND id=$2',
      [id, documentId],
    );
    if (!file) throw new NotFoundException('Document not found');
    return file;
  }
}
