import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ComplianceTask } from '../compliance/entities/compliance-task.entity';
import { AssignmentsModule } from '../assignments/assignments.module';
import { ComplianceReportController } from './compliance-report.controller';
import { AuditReportController } from './audit-report.controller';
import { AssignmentReportController } from './assignment-report.controller';
import { AuthModule } from '../auth/auth.module';
import { ReportExportService } from './report-export.service';
import { ReportExportController } from './report-export.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ComplianceTask]),
    AssignmentsModule,
    AuthModule,
  ],
  providers: [ReportsService, ReportExportService],
  controllers: [
    ReportsController,
    ComplianceReportController,
    AuditReportController,
    AssignmentReportController,
    ReportExportController,
  ],
})
export class ReportsModule {}
