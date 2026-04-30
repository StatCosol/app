import { CcoModule } from './cco/cco.module';
import { CeoModule } from './ceo/ceo.module';
import { CrmModule } from './crm/crm.module';
import { AuditorModule } from './auditor/auditor.module';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CleanupModule } from './cleanup/cleanup.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

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
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { ScopeGuard } from './auth/guards/scope.guard';
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
import { CrmDocumentsModule } from './crm-documents/crm-documents.module';
import { OptionsModule } from './options/options.module';
import { SharedModule } from './common/shared.module';
import { SafetyDocumentsModule } from './safety-documents/safety-documents.module';
import { MastersModule } from './masters/masters.module';
import { UnitsModule } from './units/units.module';
import { ApplicabilityModule } from './applicability/applicability.module';
import { AttendanceModule } from './attendance/attendance.module';
import { BiometricModule } from './biometric/biometric.module';
import { NewsModule } from './news/news.module';
import { AutomationModule } from './automation/automation.module';
import { TaskCenterModule } from './task-center/task-center.module';
import { NoticesModule } from './notices/notices.module';
import { PerformanceAppraisalModule } from './performance-appraisal/performance-appraisal.module';
import { AccountsBillingModule } from './accounts-billing/accounts-billing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level:
            config.get<string>('NODE_ENV') === 'production' ? 'info' : 'debug',
          transport:
            config.get<string>('NODE_ENV') !== 'production'
              ? {
                  target: 'pino-pretty',
                  options: { colorize: true, singleLine: true },
                }
              : undefined,
          autoLogging: { ignore: (req: any) => req.url === '/api/v1/health' },
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
      }),
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
        synchronize: false, // Always false — use SQL migrations for schema changes
        ssl:
          config.get<string>('DB_SSL') === 'true'
            ? { rejectUnauthorized: false }
            : false,
        extra: {
          // Pool configuration — prevent first-query hangs
          max: config.get<number>('DB_POOL_MAX', 20),
          min: config.get<number>('DB_POOL_MIN', 2),
          idleTimeoutMillis: 30000, // reclaim idle after 30s
          connectionTimeoutMillis: 5000, // fail fast if DB unreachable (5s)
        },
        retryAttempts: 5,
        retryDelay: 2000,
        logging: ['error', 'warn'],
      }),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
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
    CrmDocumentsModule,
    OptionsModule,
    SharedModule,
    SafetyDocumentsModule,
    CleanupModule,
    ApplicabilityModule,
    AttendanceModule,
    BiometricModule,
    MastersModule,
    UnitsModule,
    NewsModule,
    AutomationModule,
    TaskCenterModule,
    NoticesModule,
    PerformanceAppraisalModule,
    AccountsBillingModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ScopeGuard },
  ],
})
export class AppModule {}
