import { Module } from '@nestjs/common';
import { CrmDashboardController } from './crm-dashboard.controller';
import { CrmContractorDocumentsController } from './crm-contractor-documents.controller';
import { CrmComplianceTrackerController } from './crm-compliance-tracker.controller';
import { CrmListController } from './crm-list.controller';
import { CrmDashboardService } from './crm-dashboard.service';
import { ComplianceModule } from '../compliance/compliance.module';
import { ListQueriesModule } from '../list-queries/list-queries.module';
import { ReturnsModule } from '../returns/returns.module';

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
 * - DbService: provided globally via SharedModule
 */
@Module({
  imports: [ComplianceModule, ListQueriesModule, ReturnsModule],
  controllers: [
    CrmDashboardController,
    CrmContractorDocumentsController,
    CrmComplianceTrackerController,
    CrmListController,
  ],
  providers: [CrmDashboardService],
  exports: [CrmDashboardService],
})
export class CrmModule {}
