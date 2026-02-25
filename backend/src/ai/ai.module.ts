import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiConfigurationEntity } from './entities/ai-configuration.entity';
import { AiRiskAssessmentEntity } from './entities/ai-risk-assessment.entity';
import { AiAuditObservationEntity } from './entities/ai-audit-observation.entity';
import { AiPayrollAnomalyEntity } from './entities/ai-payroll-anomaly.entity';
import { AiInsightEntity } from './entities/ai-insight.entity';
import { AiDocumentAnalysisEntity } from './entities/ai-document-analysis.entity';
import { AiRequestEntity } from './entities/ai-request.entity';
import { AiResponseEntity } from './entities/ai-response.entity';
import { AiDocumentCheckEntity } from './entities/ai-document-check.entity';

import { AiCoreService } from './ai-core.service';
import { AiRiskEngineService } from './ai-risk-engine.service';
import { AiAuditService } from './ai-audit.service';
import { AiPayrollAnomalyService } from './ai-payroll-anomaly.service';
import { AiRequestLogService } from './ai-request-log.service';
import { AiQueryDraftService } from './ai-query-draft.service';
import { AiDocumentCheckService } from './ai-document-check.service';
import { AiRiskCacheInvalidatorService } from './ai-risk-cache-invalidator.service';
import { AiController } from './ai.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiConfigurationEntity,
      AiRiskAssessmentEntity,
      AiAuditObservationEntity,
      AiPayrollAnomalyEntity,
      AiInsightEntity,
      AiDocumentAnalysisEntity,
      AiRequestEntity,
      AiResponseEntity,
      AiDocumentCheckEntity,
    ]),
  ],
  controllers: [AiController],
  providers: [
    AiCoreService,
    AiRequestLogService,
    AiRiskEngineService,
    AiAuditService,
    AiPayrollAnomalyService,
    AiQueryDraftService,
    AiDocumentCheckService,
    AiRiskCacheInvalidatorService,
  ],
  exports: [
    AiCoreService,
    AiRequestLogService,
    AiRiskEngineService,
    AiAuditService,
    AiPayrollAnomalyService,
    AiQueryDraftService,
    AiDocumentCheckService,
    AiRiskCacheInvalidatorService,
  ],
})
export class AiModule {}
