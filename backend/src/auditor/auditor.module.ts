import { Module } from '@nestjs/common';
import { AuditorDashboardController } from './auditor-dashboard.controller';
import { AuditorBranchesController } from './auditor-branches.controller';
import { AuditorDashboardService } from './auditor-dashboard.service';
import { DbService } from '../common/db/db.service';
import { AssignmentsModule } from '../assignments/assignments.module';

/**
 * Auditor Module
 * Provides dashboard and CRUD operations for Auditor role
 *
 * Controllers:
 * - AuditorDashboardController: Dashboard KPIs + drill-down views
 *
 * Services:
 * - AuditorDashboardService: Raw SQL queries for dashboard performance
 * - DbService: PostgreSQL query execution layer
 *
 * Future:
 * - TypeORM entities for CRUD actions (update observations, submit reports, etc.)
 */
@Module({
  imports: [AssignmentsModule],
  controllers: [AuditorDashboardController, AuditorBranchesController],
  providers: [AuditorDashboardService, DbService],
  exports: [AuditorDashboardService],
})
export class AuditorModule {}
