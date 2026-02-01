import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractorDocumentEntity } from './entities/contractor-document.entity';
import { BranchContractorEntity } from '../branches/entities/branch-contractor.entity';

export type ContractorDocumentCreateDto = {
  clientId?: string; // optional: will default to logged-in user's clientId
  branchId: string;
  docType: string;
  title: string;
  auditId?: string | null;
  observationId?: string | null;
};

@Injectable()
export class ContractorDocumentsService {
  constructor(
    @InjectRepository(ContractorDocumentEntity)
    private readonly repo: Repository<ContractorDocumentEntity>,
    @InjectRepository(BranchContractorEntity)
    private readonly branchContractorRepo: Repository<BranchContractorEntity>,
  ) {}

  async contractorUpload(user: any, dto: ContractorDocumentCreateDto, file: any) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (!user?.clientId) {
      throw new BadRequestException('Contractor is not linked to a client');
    }
    if (!dto?.branchId) throw new BadRequestException('branchId is required');
    if (!dto?.docType) throw new BadRequestException('docType is required');
    if (!dto?.title) throw new BadRequestException('title is required');
    if (!file) throw new BadRequestException('file is required');

    const clientId = dto.clientId ?? user.clientId;
    if (clientId !== user.clientId) {
      throw new BadRequestException('Invalid clientId');
    }

    // Ensure contractor is mapped to the branch (branch_contractor is single source of truth)
    const link = await this.branchContractorRepo.findOne({
      where: {
        clientId,
        branchId: dto.branchId,
        contractorUserId: user.id,
      },
    });
    if (!link) {
      throw new BadRequestException('Contractor is not mapped to this branch');
    }

    const row = this.repo.create({
      contractorId: user.id,
      clientId,
      branchId: dto.branchId,
      docType: dto.docType,
      title: dto.title,
      auditId: dto.auditId ?? null,
      observationId: dto.observationId ?? null,
      fileName: file.originalname,
      filePath: file.path,
      fileType: file.mimetype ?? null,
      fileSize: file.size != null ? String(file.size) : null,
      uploadedByUserId: user.id,
    });

    const saved = await this.repo.save(row);
    return {
      id: saved.id,
      contractorId: saved.contractorId,
      clientId: saved.clientId,
      branchId: saved.branchId,
      docType: saved.docType,
      title: saved.title,
      auditId: saved.auditId,
      observationId: saved.observationId,
      fileName: saved.fileName,
      filePath: saved.filePath,
      fileType: saved.fileType,
      fileSize: saved.fileSize,
      uploadedByUserId: saved.uploadedByUserId,
      createdAt: saved.createdAt,
    };
  }

  async contractorList(user: any, q: any) {
    if (!user?.id) throw new BadRequestException('Invalid user');
    if (!user?.clientId) {
      throw new BadRequestException('Contractor is not linked to a client');
    }

    const qb = this.repo
      .createQueryBuilder('d')
      .where('d.contractor_id = :contractorId', { contractorId: user.id })
      .andWhere('d.client_id = :clientId', { clientId: user.clientId });

    if (q?.branchId) qb.andWhere('d.branch_id = :branchId', { branchId: q.branchId });
    if (q?.auditId) qb.andWhere('d.audit_id = :auditId', { auditId: q.auditId });
    if (q?.observationId)
      qb.andWhere('d.observation_id = :observationId', { observationId: q.observationId });
    if (q?.docType) qb.andWhere('d.doc_type = :docType', { docType: q.docType });

    qb.orderBy('d.created_at', 'DESC');

    const rows = await qb.getMany();
    return rows.map((r) => ({
      id: r.id,
      contractorId: r.contractorId,
      clientId: r.clientId,
      branchId: r.branchId,
      docType: r.docType,
      title: r.title,
      auditId: r.auditId,
      observationId: r.observationId,
      fileName: r.fileName,
      filePath: r.filePath,
      fileType: r.fileType,
      fileSize: r.fileSize,
      uploadedByUserId: r.uploadedByUserId,
      createdAt: r.createdAt,
    }));
  }

  /** CRM/Admin listing: can list any contractor's documents within a client. */
  async listByClient(user: any, q: any) {
    if (!q?.clientId) throw new BadRequestException('clientId is required');

    const qb = this.repo
      .createQueryBuilder('d')
      .where('d.client_id = :clientId', { clientId: q.clientId });

    if (q?.contractorId) qb.andWhere('d.contractor_id = :contractorId', { contractorId: q.contractorId });
    if (q?.branchId) qb.andWhere('d.branch_id = :branchId', { branchId: q.branchId });
    if (q?.auditId) qb.andWhere('d.audit_id = :auditId', { auditId: q.auditId });
    if (q?.observationId)
      qb.andWhere('d.observation_id = :observationId', { observationId: q.observationId });
    if (q?.docType) qb.andWhere('d.doc_type = :docType', { docType: q.docType });

    qb.orderBy('d.created_at', 'DESC');
    const rows = await qb.getMany();
    return rows.map((r) => ({
      id: r.id,
      contractorId: r.contractorId,
      clientId: r.clientId,
      branchId: r.branchId,
      docType: r.docType,
      title: r.title,
      auditId: r.auditId,
      observationId: r.observationId,
      fileName: r.fileName,
      filePath: r.filePath,
      fileType: r.fileType,
      fileSize: r.fileSize,
      uploadedByUserId: r.uploadedByUserId,
      createdAt: r.createdAt,
    }));
  }
}
