import { Module } from '@nestjs/common';
import { LegitxDashboardController } from './legitx-dashboard.controller';
import { LegitxDashboardService } from './legitx-dashboard.service';
import { LegitxComplianceController } from './legitx-compliance.controller';
import { LegitxComplianceService } from './legitx-compliance.service';
import { LegitxComplianceStatusController } from './legitx-compliance-status.controller';
import { LegitxComplianceStatusService } from './legitx-compliance-status.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [
    LegitxDashboardController,
    LegitxComplianceController,
    LegitxComplianceStatusController,
  ],
  providers: [
    LegitxDashboardService,
    LegitxComplianceService,
    LegitxComplianceStatusService,
  ],
  exports: [
    LegitxDashboardService,
    LegitxComplianceService,
    LegitxComplianceStatusService,
  ],
})
export class LegitxModule {}
