import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminDigestService } from './admin-digest.service';
import { AdminDigestController } from './admin-digest.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { PayrollTemplate } from '../payroll/entities/payroll-template.entity';
import { PayrollTemplateComponent } from '../payroll/entities/payroll-template-component.entity';
import { PayrollClientTemplate } from '../payroll/entities/payroll-client-template.entity';
import { PayrollClientSettings } from '../payroll/entities/payroll-client-settings.entity';
import { AdminPayrollClientSettingsController } from './admin-payroll-client-settings.controller';
import { AdminPayrollTemplatesController } from './admin-payroll-templates.controller';

@Module({
  imports: [
    NotificationsModule,
    EmailModule,
    TypeOrmModule.forFeature([
      PayrollTemplate,
      PayrollTemplateComponent,
      PayrollClientTemplate,
      PayrollClientSettings,
    ]),
  ],
  controllers: [
    AdminDigestController,
    AdminPayrollTemplatesController,
    AdminPayrollClientSettingsController,
  ],
  providers: [AdminDigestService],
})
export class AdminModule {}
