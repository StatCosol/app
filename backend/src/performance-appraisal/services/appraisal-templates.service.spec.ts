import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppraisalTemplatesService } from './appraisal-templates.service';
import { AppraisalTemplateEntity } from '../entities/appraisal-template.entity';
import { AppraisalTemplateSectionEntity } from '../entities/appraisal-template-section.entity';
import { AppraisalTemplateItemEntity } from '../entities/appraisal-template-item.entity';
import { AppraisalRatingScaleEntity } from '../entities/appraisal-rating-scale.entity';
import { AppraisalRatingScaleItemEntity } from '../entities/appraisal-rating-scale-item.entity';

const repoMock = {
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  save: jest.fn(),
};

describe('AppraisalTemplatesService', () => {
  let service: AppraisalTemplatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppraisalTemplatesService,
        { provide: getRepositoryToken(AppraisalTemplateEntity), useValue: { ...repoMock } },
        { provide: getRepositoryToken(AppraisalTemplateSectionEntity), useValue: { ...repoMock } },
        { provide: getRepositoryToken(AppraisalTemplateItemEntity), useValue: { ...repoMock } },
        { provide: getRepositoryToken(AppraisalRatingScaleEntity), useValue: { ...repoMock } },
        { provide: getRepositoryToken(AppraisalRatingScaleItemEntity), useValue: { ...repoMock } },
      ],
    }).compile();

    service = module.get<AppraisalTemplatesService>(AppraisalTemplatesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
