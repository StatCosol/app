import { Injectable } from '@nestjs/common';
import { LicenceAlertsService } from './licence-alerts.service';

/** Compatibility entry point; scheduling is owned by LicenceAlertsService. */
@Injectable()
export class BranchRegistrationReminderService {
  constructor(private readonly alerts: LicenceAlertsService) {}
  checkExpiries() {
    return this.alerts.checkScheduled();
  }
}
