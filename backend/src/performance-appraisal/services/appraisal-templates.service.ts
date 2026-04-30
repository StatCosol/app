import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppraisalTemplateEntity } from '../entities/appraisal-template.entity';
import { AppraisalTemplateSectionEntity } from '../entities/appraisal-template-section.entity';
import { AppraisalTemplateItemEntity } from '../entities/appraisal-template-item.entity';
import { AppraisalRatingScaleEntity } from '../entities/appraisal-rating-scale.entity';
import { AppraisalRatingScaleItemEntity } from '../entities/appraisal-rating-scale-item.entity';
import { CreateAppraisalTemplateDto } from '../dto/appraisal-template.dto';

@Injectable()
export class AppraisalTemplatesService {
  constructor(
    @InjectRepository(AppraisalTemplateEntity)
    private readonly templateRepo: Repository<AppraisalTemplateEntity>,
    @InjectRepository(AppraisalTemplateSectionEntity)
    private readonly sectionRepo: Repository<AppraisalTemplateSectionEntity>,
    @InjectRepository(AppraisalTemplateItemEntity)
    private readonly itemRepo: Repository<AppraisalTemplateItemEntity>,
    @InjectRepository(AppraisalRatingScaleEntity)
    private readonly scaleRepo: Repository<AppraisalRatingScaleEntity>,
    @InjectRepository(AppraisalRatingScaleItemEntity)
    private readonly scaleItemRepo: Repository<AppraisalRatingScaleItemEntity>,
  ) {}

  async createTemplate(
    clientId: string,
    dto: CreateAppraisalTemplateDto,
    userId: string,
  ) {
    const template = await this.templateRepo.save({
      clientId,
      templateCode: dto.templateCode,
      templateName: dto.templateName,
      description: dto.description ?? null,
      ratingScaleId: dto.ratingScaleId ?? null,
      isDefault: dto.isDefault ?? false,
      createdBy: userId,
    });

    if (dto.sections?.length) {
      for (const sec of dto.sections) {
        const section = await this.sectionRepo.save({
          templateId: template.id,
          sectionCode: sec.sectionCode,
          sectionName: sec.sectionName,
          sectionType: sec.sectionType ?? 'KPI',
          sequence: sec.sequence ?? 0,
          weightage: sec.weightage ?? 0,
        });

        if (sec.items?.length) {
          const items = sec.items.map((item) =>
            this.itemRepo.create({
              templateId: template.id,
              sectionId: section.id,
              itemCode: item.itemCode,
              itemName: item.itemName,
              description: item.description ?? null,
              weightage: item.weightage ?? 0,
              maxScore: item.maxScore ?? 5,
              sequence: item.sequence ?? 0,
              inputType: item.inputType ?? 'RATING',
            }),
          );
          await this.itemRepo.save(items);
        }
      }
    }

    return this.findOneTemplate(template.id);
  }

  async findAllTemplates(clientId: string) {
    return this.templateRepo.find({
      where: { clientId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOneTemplate(id: string) {
    const template = await this.templateRepo.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');

    const sections = await this.sectionRepo.find({
      where: { templateId: id },
      order: { sequence: 'ASC' },
    });

    const items = await this.itemRepo.find({
      where: { templateId: id, isActive: true },
      order: { sequence: 'ASC' },
    });

    // Group items by section
    const sectionsWithItems = sections.map((s) => ({
      ...s,
      items: items.filter((i) => i.sectionId === s.id),
    }));

    return { ...template, sections: sectionsWithItems };
  }

  // Rating scale CRUD
  async findAllScales(clientId: string) {
    return this.scaleRepo.find({
      where: { clientId, isActive: true },
    });
  }

  async createScale(
    clientId: string,
    data: {
      scaleName: string;
      items: {
        ratingCode: string;
        ratingLabel: string;
        minScore: number;
        maxScore: number;
        colorCode?: string;
        sequence: number;
      }[];
    },
  ) {
    const scale = await this.scaleRepo.save({
      clientId,
      scaleName: data.scaleName,
    });

    if (data.items?.length) {
      const items = data.items.map((i) =>
        this.scaleItemRepo.create({
          scaleId: scale.id,
          ratingCode: i.ratingCode,
          ratingLabel: i.ratingLabel,
          minScore: i.minScore,
          maxScore: i.maxScore,
          colorCode: i.colorCode ?? null,
          sequence: i.sequence,
        }),
      );
      await this.scaleItemRepo.save(items);
    }

    return this.findOneScale(scale.id);
  }

  async findOneScale(id: string) {
    const scale = await this.scaleRepo.findOne({ where: { id } });
    if (!scale) throw new NotFoundException('Scale not found');

    const items = await this.scaleItemRepo.find({
      where: { scaleId: id },
      order: { sequence: 'ASC' },
    });

    return { ...scale, items };
  }
}
