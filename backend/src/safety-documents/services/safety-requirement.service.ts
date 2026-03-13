import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchSafetyUploadEntity } from '../entities/branch-safety-upload.entity';
import { UnitFactsEntity } from '../../units/entities/unit-facts.entity';

@Injectable()
export class SafetyRequirementService {
  constructor(
    @InjectRepository(BranchSafetyUploadEntity)
    private readonly uploadRepo: Repository<BranchSafetyUploadEntity>,

    @InjectRepository(UnitFactsEntity)
    private readonly factsRepo: Repository<UnitFactsEntity>,
  ) {}

  /**
   * Return safety documents required for a branch, based on its facts.
   * Filters by: applicable_to, is_hazardous_only, headcount range, special_act_code.
   * For each required doc, checks if an upload exists.
   */
  async getRequired(branchId: string) {
    const facts = await this.factsRepo.findOne({ where: { branchId } });
    if (!facts) {
      return { required: [], message: 'No facts configured for this branch' };
    }

    // Query safety_document_master with engine-aware filters
    const rows: any[] = await this.uploadRepo.manager.query(
      `SELECT id, document_name, code, category, frequency,
              applicable_to, is_mandatory, is_hazardous_only,
              min_headcount, max_headcount, special_act_code
       FROM safety_document_master
       WHERE is_active = true
       ORDER BY sort_order, document_name`,
    );

    const estType = facts.establishmentType; // FACTORY | ESTABLISHMENT | BOTH
    const headcount = facts.employeeTotal;

    const required = rows.filter((doc) => {
      // Filter by applicable_to
      if (
        doc.applicable_to &&
        doc.applicable_to !== 'ALL' &&
        doc.applicable_to !== estType &&
        estType !== 'BOTH'
      ) {
        return false;
      }

      // Filter by hazardous
      if (doc.is_hazardous_only && !facts.isHazardous) {
        return false;
      }

      // Filter by headcount range
      if (doc.min_headcount != null && headcount < doc.min_headcount) {
        return false;
      }
      if (doc.max_headcount != null && headcount > doc.max_headcount) {
        return false;
      }

      return true;
    });

    // Check existing uploads for this branch
    const uploads = await this.uploadRepo.find({ where: { branchId } });
    const uploadMap = new Map(uploads.map((u) => [`${u.docMasterId}`, u]));

    const result = required.map((doc) => {
      const upload = uploadMap.get(`${doc.id}`);
      return {
        docMasterId: doc.id,
        documentName: doc.document_name,
        code: doc.code,
        category: doc.category,
        frequency: doc.frequency,
        isMandatory: doc.is_mandatory,
        uploaded: !!upload,
        uploadStatus: upload?.status ?? null,
        uploadId: upload?.id ?? null,
      };
    });

    return { required: result };
  }

  async getStatus(branchId: string) {
    const payload = await this.getRequired(branchId);
    const required = Array.isArray((payload as any)?.required)
      ? ((payload as any).required as Array<{ uploadStatus?: string | null; uploaded?: boolean }>)
      : [];

    const total = required.length;
    const uploaded = required.filter((row) => {
      const status = String(row.uploadStatus || '').toUpperCase();
      return row.uploaded || status === 'UPLOADED' || status === 'ACTIVE';
    }).length;
    const expired = required.filter((row) => {
      const status = String(row.uploadStatus || '').toUpperCase();
      return status === 'EXPIRED';
    }).length;
    const missing = Math.max(total - uploaded, 0);

    return {
      branchId,
      total,
      uploaded,
      missing,
      expired,
      completenessPct: total > 0 ? Math.round((uploaded / total) * 100) : 0,
      message: (payload as any)?.message ?? null,
    };
  }

  async getMasterDocument(docMasterId: number) {
    if (!Number.isFinite(docMasterId) || docMasterId <= 0) return null;
    const [row] = await this.uploadRepo.manager.query(
      `SELECT id, document_name, category, frequency, applicable_to
       FROM safety_document_master
       WHERE id = $1
       LIMIT 1`,
      [docMasterId],
    );
    return row || null;
  }
}
