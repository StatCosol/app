import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { mkdir, unlink, writeFile } from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ReqUser } from '../access/access-scope.service';
import { assertClientRecord } from '../common/portal-client-scope';
import { assertSafeFile } from '../common/safe-upload';
import {
  ensureAuditChecklist,
  auditChecklistEntries,
  missingChecklistEntries,
  appendMissingAuditChecklist,
} from './audit-checklist-template.helpers';
import {
  AddFieldworkItemDto,
  ReviewFieldworkDto,
  UploadFieldworkEvidenceDto,
} from './dto/audit-fieldwork.dto';

const EDITABLE = [
  'PLANNED',
  'IN_PROGRESS',
  'CORRECTION_PENDING',
  'REVERIFICATION_PENDING',
];
const SITE_TYPES = new Set([
  'EMERGENCY_EVACUATION',
  'FIRE_EQUIPMENT',
  'MACHINE_GUARDING',
  'ELECTRICAL_SAFETY',
  'FIRST_AID_BOX',
  'HOUSEKEEPING',
  'CRECHE_FACILITY',
  'LOAD_SAFETY',
  'STORAGE_RACK_INSPECTION',
  'WAREHOUSE_FIRE_SAFETY',
  'MATERIAL_HANDLING',
  'STORAGE_CONDITIONS',
  'WAREHOUSE_SECURITY',
]);
@Injectable()
export class AuditFieldworkService {
  constructor(private readonly db: DataSource) {}
  private async audit(
    user: ReqUser,
    id: string,
    db = this.db.manager,
    lock = false,
  ) {
    const [a] = await db.query(
      `SELECT a.*, c.client_name AS "clientName", b.branchname AS "branchName" FROM audits a JOIN clients c ON c.id=a.client_id LEFT JOIN client_branches b ON b.id=a.branch_id WHERE a.id=$1 ${lock ? 'FOR UPDATE OF a' : ''}`,
      [id],
    );
    if (!a) throw new NotFoundException('Audit not found');
    if (user.roleCode === 'AUDITOR') {
      if (a.assigned_auditor_id !== (user.userId || user.id))
        throw new ForbiddenException('Not your assigned audit');
    } else if (user.roleCode === 'CLIENT') {
      await assertClientRecord(db, user, a.client_id, a.branch_id);
    } else
      throw new ForbiddenException(
        'Client or assigned auditor access required',
      );
    return a;
  }
  private async writable(a: any, db: EntityManager) {
    if (!EDITABLE.includes(a.status)) return false;
    const [report] = await db.query(
      'SELECT status FROM audit_reports WHERE audit_id=$1 ORDER BY updated_at DESC LIMIT 1',
      [a.id],
    );
    return !report || report.status === 'DRAFT';
  }
  private async assertWritable(a: any, db: EntityManager) {
    if (!(await this.writable(a, db)))
      throw new BadRequestException(
        'This audit is read-only. Ask the audit manager to reopen it before making changes.',
      );
  }
  async workspace(user: ReqUser, id: string) {
    const a = await this.audit(user, id);
    const canEdit = await this.writable(a, this.db.manager);
    // Existing scheduled audits may predate automatic checklist creation.
    if (canEdit)
      await this.db.transaction(async (db) => {
        const locked = await this.audit(user, id, db, true);
        await this.assertWritable(locked, db);
        await ensureAuditChecklist(db, {
          id,
          clientId: a.client_id,
          auditType: a.audit_type,
          contractorUserId: a.contractor_user_id,
        });
      });
    const items = await this.db.query(
      `SELECT i.id, i.item_label AS "itemLabel", i.doc_type AS "docType", i.status, i.remarks, i.automated_remarks AS "automatedRemarks", i.automation_reviewed AS "automationReviewed", i.evidence_revision AS revision, i.evidence_kind AS kind, i.reviewed_at AS "reviewedAt", u.name AS "reviewedByName" FROM audit_checklist_items i LEFT JOIN users u ON u.id=i.reviewed_by WHERE i.audit_id=$1 ORDER BY i.sort_order,i.created_at,i.id`,
      [id],
    );
    const evidence = await this.db.query(
      `SELECT e.id, e.item_id AS "itemId", e.file_name AS "fileName", e.mime_type AS "mimeType", e.file_size AS "fileSize", e.description,e.location,e.uploaded_role AS "uploadedRole",e.revision,e.created_at AS "createdAt",u.name AS "uploadedByName" FROM audit_item_evidence e JOIN users u ON u.id=e.uploaded_by WHERE e.audit_id=$1 ORDER BY e.created_at DESC,e.id`,
      [id],
    );
    const history = await this.db.query(
      `SELECT r.id,r.item_id AS "itemId",r.decision,r.remarks,r.evidence_revision AS revision,r.created_at AS "createdAt",u.name AS "reviewedByName" FROM audit_item_reviews r JOIN users u ON u.id=r.reviewed_by WHERE r.audit_id=$1 ORDER BY r.created_at DESC,r.id`,
      [id],
    );
    return {
      audit: {
        id: a.id,
        code: a.audit_code,
        type: a.audit_type,
        status: a.status,
        clientName: a.clientName,
        branchName: a.branchName,
        period: a.period_code,
        dueDate: a.due_date,
      },
      canEdit,
      availablePoints: canEdit
        ? missingChecklistEntries(
            await auditChecklistEntries(
              {
                id,
                clientId: a.client_id,
                auditType: a.audit_type,
                contractorUserId: a.contractor_user_id,
              },
              this.db.manager,
            ),
            items,
          ).length
        : 0,
      items: items.map((i) => ({
        ...i,
        kind:
          i.kind === 'SITE_INSPECTION' || SITE_TYPES.has(i.docType)
            ? 'SITE_INSPECTION'
            : 'DOCUMENT',
        evidence: evidence
          .filter((e) => e.itemId === i.id)
          .map((e) => ({
            ...e,
            url: `/api/v1/audit-fieldwork/${id}/evidence/${e.id}/file`,
          })),
        history: history.filter((h) => h.itemId === i.id),
      })),
    };
  }
  async refreshChecklist(user: ReqUser, id: string) {
    if (user.roleCode !== 'AUDITOR')
      throw new ForbiddenException(
        'Only the assigned auditor can update the checklist',
      );
    return this.db.transaction(async (db) => {
      const a = await this.audit(user, id, db, true);
      await this.assertWritable(a, db);
      return appendMissingAuditChecklist(db, {
        id,
        clientId: a.client_id,
        auditType: a.audit_type,
        contractorUserId: a.contractor_user_id,
      });
    });
  }
  async add(user: ReqUser, id: string, body: AddFieldworkItemDto) {
    if (user.roleCode !== 'AUDITOR')
      throw new ForbiddenException(
        'Only the assigned auditor can add inspection points',
      );
    if (body.label.trim().length < 3)
      throw new BadRequestException('Enter an audit point');
    return this.db.transaction(async (db) => {
      const a = await this.audit(user, id, db, true);
      await this.assertWritable(a, db);
      await ensureAuditChecklist(db, {
        id,
        clientId: a.client_id,
        auditType: a.audit_type,
        contractorUserId: a.contractor_user_id,
      });
      const [item] = await db.query(
        `INSERT INTO audit_checklist_items(audit_id,item_label,evidence_kind,status,is_required,sort_order) SELECT $1,$2,$3,'PENDING',TRUE,COALESCE(MAX(sort_order),0)+1 FROM audit_checklist_items WHERE audit_id=$1 RETURNING id`,
        [id, body.label.trim(), body.kind],
      );
      return item;
    });
  }
  async upload(
    user: ReqUser,
    id: string,
    itemId: string,
    body: UploadFieldworkEvidenceDto,
    file: Express.Multer.File,
  ) {
    assertSafeFile(
      file,
      !['.txt', '.csv'].includes(
        path.extname(file?.originalname || '').toLowerCase(),
      ),
    );
    if (body.description.trim().length < 5)
      throw new BadRequestException(
        'Describe the document or site observation',
      );
    let savedPath: string | null = null;
    try {
      return await this.db.transaction(async (db) => {
        const a = await this.audit(user, id, db, true);
        await this.assertWritable(a, db);
        const [item] = await db.query(
          'SELECT * FROM audit_checklist_items WHERE id=$1 AND audit_id=$2 FOR UPDATE',
          [itemId, id],
        );
        if (!item) throw new NotFoundException('Audit point not found');
        const name =
          randomUUID() + path.extname(file.originalname).toLowerCase();
        const root = path.resolve(process.cwd(), 'uploads', 'audit-evidence');
        await mkdir(root, { recursive: true });
        savedPath = path.join(root, name);
        await writeFile(savedPath, file.buffer, { flag: 'wx' });
        const revision = item.evidence_revision + 1;
        const [e] = await db.query(
          `INSERT INTO audit_item_evidence(audit_id,item_id,file_name,stored_name,mime_type,file_size,description,location,uploaded_by,uploaded_role,revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [
            id,
            itemId,
            path.basename(file.originalname).slice(0, 255),
            name,
            file.mimetype,
            file.size,
            body.description.trim(),
            body.location?.trim() || null,
            user.userId || user.id,
            user.roleCode,
            revision,
          ],
        );
        await db.query(
          `UPDATE audit_checklist_items SET status='UPLOADED',evidence_revision=$2,reviewed_by=NULL,reviewed_at=NULL,automation_reviewed=FALSE,updated_at=now() WHERE id=$1`,
          [itemId, revision],
        );
        return e;
      });
    } catch (error) {
      if (savedPath) await unlink(savedPath).catch(() => {});
      throw error;
    }
  }
  async review(
    user: ReqUser,
    id: string,
    itemId: string,
    body: ReviewFieldworkDto,
  ) {
    if (user.roleCode !== 'AUDITOR')
      throw new ForbiddenException(
        'Only the assigned auditor can verify evidence',
      );
    if (body.remarks.trim().length < 5)
      throw new BadRequestException('Write remarks supporting your decision');
    return this.db.transaction(async (db) => {
      const a = await this.audit(user, id, db, true);
      await this.assertWritable(a, db);
      const [item] = await db.query(
        'SELECT * FROM audit_checklist_items WHERE id=$1 AND audit_id=$2 FOR UPDATE',
        [itemId, id],
      );
      if (!item) throw new NotFoundException('Audit point not found');
      if (item.evidence_revision !== body.revision)
        throw new ConflictException(
          'New evidence was uploaded. Refresh and review it before saving your decision.',
        );
      if (
        item.automated_remarks &&
        !body.automationReviewed &&
        body.decision !== 'PENDING'
      )
        throw new BadRequestException(
          'Review the generated remarks before confirming your decision',
        );
      await db.query(
        `UPDATE audit_checklist_items SET status=$2,remarks=$3,automation_reviewed=$4,reviewed_by=$5,reviewed_at=now(),updated_at=now() WHERE id=$1`,
        [
          itemId,
          body.decision,
          body.remarks.trim(),
          !!body.automationReviewed,
          user.userId || user.id,
        ],
      );
      await db.query(
        `INSERT INTO audit_item_reviews(audit_id,item_id,decision,remarks,evidence_revision,reviewed_by) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          id,
          itemId,
          body.decision,
          body.remarks.trim(),
          body.revision,
          user.userId || user.id,
        ],
      );
      return { saved: true };
    });
  }
  async file(user: ReqUser, id: string, evidenceId: string) {
    await this.audit(user, id);
    const [e] = await this.db.query(
      'SELECT stored_name,file_name FROM audit_item_evidence WHERE id=$1 AND audit_id=$2',
      [evidenceId, id],
    );
    if (!e) throw new NotFoundException('Evidence not found');
    if (path.basename(e.stored_name) !== e.stored_name)
      throw new BadRequestException('Invalid evidence path');
    return {
      path: path.resolve(
        process.cwd(),
        'uploads',
        'audit-evidence',
        e.stored_name,
      ),
      name: e.file_name,
    };
  }
}
