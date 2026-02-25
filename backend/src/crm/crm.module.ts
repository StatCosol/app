import { Module } from '@nestjs/common';
import { CrmDashboardController } from './crm-dashboard.controller';
import { CrmContractorDocumentsController } from './crm-contractor-documents.controller';
import { CrmComplianceTrackerController } from './crm-compliance-tracker.controller';
import { CrmDashboardService } from './crm-dashboard.service';
import { DbService } from '../common/db/db.service';

/**
 * CRM Module
 * Provides dashboard and CRUD operations for CRM role
 *
 * Controllers:
 * - CrmDashboardController: Dashboard KPIs + drill-down views
 * - CrmContractorDocumentsController: Document list/review
 * - CrmComplianceTrackerController: MCD tracker + audit closures
 *
 * Services:
 * - CrmDashboardService: Raw SQL queries for dashboard performance
 * - DbService: PostgreSQL query execution layer
 */
@Module({
  imports: [],
  controllers: [CrmDashboardController, CrmContractorDocumentsController, CrmComplianceTrackerController],
  providers: [CrmDashboardService, DbService],
  exports: [CrmDashboardService],
})
export class CrmModule {}
