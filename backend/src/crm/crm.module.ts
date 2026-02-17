import { Module } from '@nestjs/common';
import { CrmDashboardController } from './crm-dashboard.controller';
import { CrmDashboardService } from './crm-dashboard.service';
import { DbService } from '../common/db/db.service';

/**
 * CRM Module
 * Provides dashboard and CRUD operations for CRM role
 *
 * Controllers:
 * - CrmDashboardController: Dashboard KPIs + drill-down views
 *
 * Services:
 * - CrmDashboardService: Raw SQL queries for dashboard performance
 * - DbService: PostgreSQL query execution layer
 *
 * Future:
 * - TypeORM entities for CRUD actions (reassign clients, notify, etc.)
 */
@Module({
  imports: [],
  controllers: [CrmDashboardController],
  providers: [CrmDashboardService, DbService],
  exports: [CrmDashboardService],
})
export class CrmModule {}
