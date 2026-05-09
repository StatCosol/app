import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppraisalRatingScaleEntity } from './entities/appraisal-rating-scale.entity';
import { AppraisalRatingScaleItemEntity } from './entities/appraisal-rating-scale-item.entity';
import { AppraisalTemplateEntity } from './entities/appraisal-template.entity';
import { AppraisalTemplateSectionEntity } from './entities/appraisal-template-section.entity';
import { AppraisalTemplateItemEntity } from './entities/appraisal-template-item.entity';
import { AppraisalCycleEntity } from './entities/appraisal-cycle.entity';
import { AppraisalCycleScopeEntity } from './entities/appraisal-cycle-scope.entity';
import { EmployeeAppraisalEntity } from './entities/employee-appraisal.entity';
import { EmployeeAppraisalItemEntity } from './entities/employee-appraisal-item.entity';
import { AppraisalApprovalEntity } from './entities/appraisal-approval.entity';
import { AppraisalAuditLogEntity } from './entities/appraisal-audit-log.entity';

import { AppraisalCyclesService } from './services/appraisal-cycles.service';
import { EmployeeAppraisalsService } from './services/employee-appraisals.service';
import { AppraisalTemplatesService } from './services/appraisal-templates.service';
import { AppraisalReportsService } from './services/appraisal-reports.service';

import { AppraisalCyclesController } from './controllers/appraisal-cycles.controller';
import { EmployeeAppraisalsController } from './controllers/employee-appraisals.controller';
import { AppraisalTemplatesController } from './controllers/appraisal-templates.controller';
import { AppraisalReportsController } from './controllers/appraisal-reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AppraisalRatingScaleEntity,
      AppraisalRatingScaleItemEntity,
      AppraisalTemplateEntity,
      AppraisalTemplateSectionEntity,
      AppraisalTemplateItemEntity,
      AppraisalCycleEntity,
      AppraisalCycleScopeEntity,
      EmployeeAppraisalEntity,
      EmployeeAppraisalItemEntity,
      AppraisalApprovalEntity,
      AppraisalAuditLogEntity,
    ]),
  ],
  controllers: [
    AppraisalCyclesController,
    EmployeeAppraisalsController,
    AppraisalTemplatesController,
    AppraisalReportsController,
  ],
  providers: [
    AppraisalCyclesService,
    EmployeeAppraisalsService,
    AppraisalTemplatesService,
    AppraisalReportsService,
  ],
  exports: [
    AppraisalCyclesService,
    EmployeeAppraisalsService,
    AppraisalTemplatesService,
    AppraisalReportsService,
  ],
})
export class PerformanceAppraisalModule {}
