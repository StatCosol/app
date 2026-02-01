import { CcoModule } from './cco/cco.module';
import { CeoModule } from './ceo/ceo.module';
import { Module } from '@nestjs/common';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
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
import { AssignmentsRotationModule } from './assignments-rotation/assignments-rotation.module';
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

import { PayrollModule } from './payroll/payroll.module';
import { HelpdeskModule } from './helpdesk/helpdesk.module';
import { FilesModule } from './files/files.module';

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
    AssignmentsRotationModule,
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
    AdminModule,
    PayrollModule,
    HelpdeskModule,
    FilesModule,
  ],
  controllers: [AdminDashboardController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
