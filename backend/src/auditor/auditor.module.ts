import { Module } from '@nestjs/common';
import { AuditorDashboardController } from './auditor-dashboard.controller';
import { AuditorBranchesController } from './auditor-branches.controller';
import { AuditorListController } from './auditor-list.controller';
import { AuditorDashboardService } from './auditor-dashboard.service';
import { AssignmentsModule } from '../assignments/assignments.module';
import { ListQueriesModule } from '../list-queries/list-queries.module';

/**
 * Auditor Module
 * Provides dashboard and CRUD operations for Auditor role
 *
 * Controllers:
 * - AuditorDashboardController: Dashboard KPIs + drill-down views
 *
 * Services:
 * - AuditorDashboardService: Raw SQL queries for dashboard performance
 * - DbService: provided globally via SharedModule
 *
 * Future:
 * - TypeORM entities for CRUD actions (update observations, submit reports, etc.)
 */
@Module({
  imports: [AssignmentsModule, ListQueriesModule],
  controllers: [
    AuditorDashboardController,
    AuditorBranchesController,
    AuditorListController,
  ],
  providers: [AuditorDashboardService],
  exports: [AuditorDashboardService],
})
export class AuditorModule {}
