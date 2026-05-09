import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ContractorRequiredDocumentEntity } from './entities/contractor-required-document.entity';
import { UserEntity } from '../users/entities/user.entity';

export interface AddRequiredDocDto {
  clientId: string;
  contractorUserId: string;
  branchId?: string | null;
  docType: string;
}

@Injectable()
export class ContractorRequiredDocumentsService {
  constructor(
    @InjectRepository(ContractorRequiredDocumentEntity)
    private readonly repo: Repository<ContractorRequiredDocumentEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
  ) {}

  /** List all required doc types for a contractor under a client (optionally filtered by branch). */
  async list(clientId: string, contractorId: string, branchId?: string) {
    const qb = this.repo
      .createQueryBuilder('r')
      .where('r.client_id = :clientId', { clientId })
      .andWhere('r.contractor_user_id = :contractorId', { contractorId })
      .orderBy('r.doc_type', 'ASC');

    if (branchId) {
      qb.andWhere('(r.branch_id = :branchId OR r.branch_id IS NULL)', {
        branchId,
      });
    }

    return qb.getMany();
  }

  /** List all required doc types for a client across all contractors (for overview). */
  async listByClient(clientId: string, branchId?: string) {
    const qb = this.repo
      .createQueryBuilder('r')
      .where('r.client_id = :clientId', { clientId })
      .orderBy('r.contractor_user_id', 'ASC')
      .addOrderBy('r.doc_type', 'ASC');

    if (branchId) {
      qb.andWhere('(r.branch_id = :branchId OR r.branch_id IS NULL)', {
        branchId,
      });
    }

    return qb.getMany();
  }

  /** Add a required doc type for a contractor. */
  async add(dto: AddRequiredDocDto) {
    if (!dto.clientId || !dto.contractorUserId || !dto.docType?.trim()) {
      throw new BadRequestException(
        'clientId, contractorUserId, and docType are required',
      );
    }

    // Validate that the contractorUserId belongs to a CONTRACTOR-role user
    const contractorUser = await this.usersRepo.findOne({
      where: { id: dto.contractorUserId },
    });
    if (!contractorUser || contractorUser.role !== 'CONTRACTOR') {
      throw new BadRequestException(
        `User ${dto.contractorUserId} is not a valid CONTRACTOR user`,
      );
    }

    const docType = dto.docType.trim().toUpperCase();

    // Check for duplicate
    const existing = await this.repo.findOne({
      where: {
        clientId: dto.clientId,
        contractorUserId: dto.contractorUserId,
        branchId: dto.branchId || IsNull(),
        docType,
      },
    });

    if (existing) {
      return existing; // idempotent
    }

    const entity = this.repo.create({
      clientId: dto.clientId,
      contractorUserId: dto.contractorUserId,
      branchId: dto.branchId || null,
      docType,
      isRequired: true,
    });

    return this.repo.save(entity);
  }

  /** Bulk-add multiple doc types for a contractor. */
  async addBulk(
    clientId: string,
    contractorId: string,
    docTypes: string[],
    branchId?: string | null,
  ) {
    if (!docTypes?.length) {
      throw new BadRequestException(
        'docTypes array is required and must not be empty',
      );
    }

    const results: ContractorRequiredDocumentEntity[] = [];
    for (const dt of docTypes) {
      const result = await this.add({
        clientId,
        contractorUserId: contractorId,
        branchId: branchId || null,
        docType: dt,
      });
      results.push(result);
    }
    return results;
  }

  /** Remove a required doc type entry by its ID. */
  async remove(id: string, clientId: string) {
    const entity = await this.repo.findOne({ where: { id, clientId } });
    if (!entity) {
      throw new BadRequestException('Required document entry not found');
    }
    await this.repo.remove(entity);
    return { deleted: true };
  }

  /** Toggle is_required flag. */
  async toggle(id: string, clientId: string) {
    const entity = await this.repo.findOne({ where: { id, clientId } });
    if (!entity) {
      throw new BadRequestException('Required document entry not found');
    }
    entity.isRequired = !entity.isRequired;
    return this.repo.save(entity);
  }

  /**
   * Standard monthly statutory compliance documents that every contractor must
   * submit each month for their contract employees.  These are always present
   * in the checklist regardless of what the CRM has configured.
   */
  private static readonly STANDARD_MONTHLY_DOC_TYPES: ReadonlyArray<string> = [
    'WAGE_REGISTER',
    'MUSTER_ROLL',
    'OT_REGISTER',
    'PF_CHALLAN',
    'ESI_CHALLAN',
    'PT_CHALLAN',
  ];

  /**
   * Get the monthly document checklist for a contractor (contractor-facing).
   * Always returns the 6 standard monthly statutory doc types plus any
   * additional ones configured by CRM in contractor_required_documents.
   * When branchId is provided, filters required docs and uploaded docs to that branch.
   */
  async getContractorChecklist(
    contractorUserId: string,
    clientId: string,
    month?: string,
    branchId?: string,
  ) {
    const now = new Date();
    const resolvedMonth =
      month?.trim() ||
      `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    const [y, m] = resolvedMonth.split('-').map(Number);
    if (!y || !m || m < 1 || m > 12) {
      throw new BadRequestException('Invalid month format, expected YYYY-MM');
    }
    const start = new Date(Date.UTC(y, m - 1, 1));
    // Grace period: docs for month M can be submitted up to end of month M+1
    // (deadline is the 20th, but we use end-of-month to avoid edge cases).
    const gracePeriodEnd = new Date(Date.UTC(y, m + 1, 1));

    // DB-configured required docs for this contractor.
    // When branchId is provided: include global (null-branch) AND branch-specific docs.
    // When not provided: include everything across all branches.
    const dbRequired = await this.repo.find({
      where: branchId
        ? [
            { contractorUserId, clientId, isRequired: true, branchId },
            {
              contractorUserId,
              clientId,
              isRequired: true,
              branchId: IsNull(),
            },
          ]
        : { contractorUserId, clientId, isRequired: true },
      order: { docType: 'ASC' },
    });

    // Merge standard types with DB-configured types (deduped, standard first)
    const dbDocTypes = new Set(dbRequired.map((r) => r.docType));
    const allDocTypes: Array<{
      docType: string;
      branchId: string | null;
      dbId: string | null;
    }> = [];

    for (const dt of ContractorRequiredDocumentsService.STANDARD_MONTHLY_DOC_TYPES) {
      const dbEntry = dbRequired.find((r) => r.docType === dt);
      allDocTypes.push({
        docType: dt,
        branchId: dbEntry?.branchId ?? null,
        dbId: dbEntry?.id ?? null,
      });
    }

    for (const r of dbRequired) {
      if (
        !dbDocTypes.has(r.docType) ||
        !ContractorRequiredDocumentsService.STANDARD_MONTHLY_DOC_TYPES.includes(
          r.docType,
        )
      ) {
        // only add if not already added from standard list
        if (!allDocTypes.some((x) => x.docType === r.docType)) {
          allDocTypes.push({
            docType: r.docType,
            branchId: r.branchId,
            dbId: r.id,
          });
        }
      }
    }

    // Upload records for this month.
    // Uses doc_month when the column exists (safe DDL probe), otherwise falls
    // back to the created_at grace-period window so the query never fails on
    // databases that haven't had the column migration applied yet.
    const hasDocMonthCol = await this.repo.manager
      .query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'contractor_documents' AND column_name = 'doc_month'
         LIMIT 1`,
      )
      .then((rows: unknown[]) => rows.length > 0)
      .catch(() => false);

    const uploaded: Array<{
      doc_type: string;
      id: string;
      file_name: string;
      status: string;
      created_at: Date;
      branch_id: string | null;
    }> = hasDocMonthCol
      ? await this.repo.manager.query(
          `SELECT doc_type, id, file_name, status, created_at, branch_id
           FROM contractor_documents
           WHERE contractor_user_id = $1 AND client_id = $2
             AND (
               doc_month = $3
               OR (doc_month IS NULL AND created_at >= $4 AND created_at < $5)
             )
             ${branchId ? 'AND branch_id = $6' : ''}
           ORDER BY created_at DESC`,
          branchId
            ? [
                contractorUserId,
                clientId,
                resolvedMonth,
                start,
                gracePeriodEnd,
                branchId,
              ]
            : [
                contractorUserId,
                clientId,
                resolvedMonth,
                start,
                gracePeriodEnd,
              ],
        )
      : await this.repo.manager.query(
          `SELECT doc_type, id, file_name, status, created_at, branch_id
           FROM contractor_documents
           WHERE contractor_user_id = $1 AND client_id = $2
             AND created_at >= $3 AND created_at < $4
             ${branchId ? 'AND branch_id = $5' : ''}
           ORDER BY created_at DESC`,
          branchId
            ? [contractorUserId, clientId, start, gracePeriodEnd, branchId]
            : [contractorUserId, clientId, start, gracePeriodEnd],
        );

    const uploadedMap = new Map<string, (typeof uploaded)[number][]>();
    for (const doc of uploaded) {
      const key = doc.doc_type;
      if (!uploadedMap.has(key)) uploadedMap.set(key, []);
      uploadedMap.get(key)!.push(doc);
    }

    const items = allDocTypes.map((entry) => {
      const docs = uploadedMap.get(entry.docType) ?? [];
      const approvedOrPending = docs.filter(
        (d) => d.status !== 'REJECTED' && d.status !== 'EXPIRED',
      );
      return {
        id: entry.dbId ?? entry.docType,
        docType: entry.docType,
        branchId: entry.branchId,
        isRequired: true,
        uploaded: approvedOrPending.length > 0,
        uploadedDocs: docs.map((d) => ({
          id: d.id,
          fileName: d.file_name,
          status: d.status,
          uploadedAt: d.created_at,
          branchId: d.branch_id,
        })),
      };
    });

    return { month: resolvedMonth, items };
  }
}
