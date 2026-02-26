import { CcoModule } from './cco/cco.module';
import { CeoModule } from './ceo/ceo.module';
import { CrmModule } from './crm/crm.module';
import { AuditorModule } from './auditor/auditor.module';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ClientsModule } from './clients/clients.module';
import { BranchesModule } from './branches/branches.module';
import { CompliancesModule } from './compliances/compliances.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { ContractorModule } from './contractor/contractor.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ComplianceModule } from './compliance/compliance.module';
import { ReportsModule } from './reports/reports.module';
import { EmailModule } from './email/email.module';
import { AuditsModule } from './audits/audits.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { AdminModule } from './admin/admin.module';

import { LegitxModule } from './legitx/legitx.module';

import { PayrollModule } from './payroll/payroll.module';
import { EmployeesModule } from './employees/employees.module';
import { HelpdeskModule } from './helpdesk/helpdesk.module';
import { FilesModule } from './files/files.module';
import { ReturnsModule } from './returns/returns.module';
import { NominationsModule } from './nominations/nominations.module';
import { ClientDashboardModule } from './client-dashboard/client-dashboard.module';
import { EssModule } from './ess/ess.module';
import { AiModule } from './ai/ai.module';
import { BranchComplianceModule } from './branch-compliance/branch-compliance.module';
import { ComplianceDocumentsModule } from './compliance-documents/compliance-documents.module';
import { CalendarModule } from './calendar/calendar.module';
import { RiskModule } from './risk/risk.module';
import { SlaModule } from './sla/sla.module';
import { EscalationsModule } from './escalations/escalations.module';
import { MonthlyDocumentsModule } from './monthly-documents/monthly-documents.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASS'),
        database: config.get<string>('DB_NAME'),
        schema: 'public',
        autoLoadEntities: true,
        synchronize: false, // DO NOT CHANGE TO TRUE IN PRODUCTION
        extra: {
          // Pool configuration — prevent first-query hangs
          max: 20,                       // max pool connections
          min: 2,                        // keep 2 warm connections
          idleTimeoutMillis: 30000,      // reclaim idle after 30s
          connectionTimeoutMillis: 5000, // fail fast if DB unreachable (5s)
        },
        retryAttempts: 5,
        retryDelay: 2000,
        logging: ['error', 'warn'],
      }),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 120,
      },
    ]),
    ScheduleModule.forRoot(),
    ClientsModule,
    BranchesModule,
    CompliancesModule,
    ChecklistsModule,
    UsersModule,
    AuthModule,
    AssignmentsModule,
    ContractorModule,
    NotificationsModule,
    ComplianceModule,
    ReportsModule,
    EmailModule,
    AuditsModule,
    AuditLogsModule,
    HealthModule,
    CcoModule,
    CeoModule,
    CrmModule,
    AuditorModule,
    AdminModule,
    PayrollModule,
    EmployeesModule,
    HelpdeskModule,
    FilesModule,
    LegitxModule,
    ReturnsModule,
    NominationsModule,
    ClientDashboardModule,
    EssModule,
    AiModule,
    BranchComplianceModule,
    ComplianceDocumentsModule,
    CalendarModule,
    RiskModule,
    SlaModule,
    EscalationsModule,
    MonthlyDocumentsModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
