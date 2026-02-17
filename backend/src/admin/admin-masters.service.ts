import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceMasterEntity } from '../compliances/entities/compliance-master.entity';
import { AuditObservationCategoryEntity } from '../audits/entities/audit-observation-category.entity';
import { Frequency } from '../common/enums';

@Injectable()
export class AdminMastersService {
  constructor(
    @InjectRepository(ComplianceMasterEntity)
    private readonly complianceRepo: Repository<ComplianceMasterEntity>,
    @InjectRepository(AuditObservationCategoryEntity)
    private readonly auditCategoryRepo: Repository<AuditObservationCategoryEntity>,
  ) {}

  // ============ Compliance Masters ============
  async listComplianceMasters() {
    return this.complianceRepo.find({ order: { complianceName: 'ASC' } });
  }

  async getComplianceMaster(id: string) {
    const master = await this.complianceRepo.findOne({ where: { id } });
    if (!master) throw new NotFoundException('Compliance master not found');
    return master;
  }

  async createComplianceMaster(dto: {
    complianceName: string;
    lawName: string;
    lawFamily?: string;
    stateScope?: string;
    minHeadcount?: number;
    maxHeadcount?: number;
    frequency: Frequency;
    description?: string;
    isActive?: boolean;
  }) {
    if (!dto.complianceName || !dto.lawName || !dto.frequency) {
      throw new BadRequestException(
        'complianceName, lawName, and frequency are required',
      );
    }

    const master = this.complianceRepo.create({
      complianceName: dto.complianceName,
      lawName: dto.lawName,
      lawFamily: dto.lawFamily || null,
      stateScope: dto.stateScope || null,
      minHeadcount: dto.minHeadcount || null,
      maxHeadcount: dto.maxHeadcount || null,
      frequency: dto.frequency,
      description: dto.description || null,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    return this.complianceRepo.save(master);
  }

  async updateComplianceMaster(id: string, dto: any) {
    const master = await this.complianceRepo.findOne({ where: { id } });
    if (!master) throw new NotFoundException('Compliance master not found');

    if (dto.complianceName !== undefined)
      master.complianceName = dto.complianceName;
    if (dto.lawName !== undefined) master.lawName = dto.lawName;
    if (dto.lawFamily !== undefined) master.lawFamily = dto.lawFamily;
    if (dto.stateScope !== undefined) master.stateScope = dto.stateScope;
    if (dto.minHeadcount !== undefined) master.minHeadcount = dto.minHeadcount;
    if (dto.maxHeadcount !== undefined) master.maxHeadcount = dto.maxHeadcount;
    if (dto.frequency !== undefined) master.frequency = dto.frequency;
    if (dto.description !== undefined) master.description = dto.description;
    if (dto.isActive !== undefined) master.isActive = dto.isActive;

    return this.complianceRepo.save(master);
  }

  async deleteComplianceMaster(id: string) {
    const master = await this.complianceRepo.findOne({ where: { id } });
    if (!master) throw new NotFoundException('Compliance master not found');

    // Soft delete by setting isActive = false
    master.isActive = false;
    await this.complianceRepo.save(master);

    return { message: 'Compliance master deleted successfully' };
  }

  // ============ Audit Observation Categories ============
  async listAuditCategories() {
    return this.auditCategoryRepo.find({ order: { name: 'ASC' } });
  }

  async createAuditCategory(dto: { name: string; description?: string }) {
    if (!dto.name) throw new BadRequestException('Category name is required');

    const category = this.auditCategoryRepo.create({
      name: dto.name,
      description: dto.description || null,
    });

    return this.auditCategoryRepo.save(category);
  }

  async updateAuditCategory(id: string, dto: any) {
    const category = await this.auditCategoryRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Audit category not found');

    if (dto.name !== undefined) category.name = dto.name;
    if (dto.description !== undefined) category.description = dto.description;

    return this.auditCategoryRepo.save(category);
  }

  async deleteAuditCategory(id: string) {
    await this.auditCategoryRepo.delete(id);
    return { message: 'Audit category deleted successfully' };
  }
}
