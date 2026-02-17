import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractorRequiredDocumentEntity } from './entities/contractor-required-document.entity';

export interface AddRequiredDocDto {
  clientId: string;
  contractorId: string;
  branchId?: string | null;
  docType: string;
}

@Injectable()
export class ContractorRequiredDocumentsService {
  constructor(
    @InjectRepository(ContractorRequiredDocumentEntity)
    private readonly repo: Repository<ContractorRequiredDocumentEntity>,
  ) {}

  /** List all required doc types for a contractor under a client (optionally filtered by branch). */
  async list(clientId: string, contractorId: string, branchId?: string) {
    const qb = this.repo
      .createQueryBuilder('r')
      .where('r.client_id = :clientId', { clientId })
      .andWhere('r.contractor_id = :contractorId', { contractorId })
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
      .orderBy('r.contractor_id', 'ASC')
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
    if (!dto.clientId || !dto.contractorId || !dto.docType?.trim()) {
      throw new BadRequestException(
        'clientId, contractorId, and docType are required',
      );
    }

    const docType = dto.docType.trim().toUpperCase();

    // Check for duplicate
    const existing = await this.repo.findOne({
      where: {
        clientId: dto.clientId,
        contractorId: dto.contractorId,
        branchId: dto.branchId || (null as any),
        docType,
      },
    });

    if (existing) {
      return existing; // idempotent
    }

    const entity = this.repo.create({
      clientId: dto.clientId,
      contractorId: dto.contractorId,
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
        contractorId,
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
}
