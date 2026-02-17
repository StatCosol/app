import { Controller, Post } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { AdminDigestService } from './admin-digest.service';

@Roles('ADMIN')
@Controller({ path: 'admin/reminders', version: '1' })
export class AdminDigestController {
  constructor(private readonly svc: AdminDigestService) {}

  @Post('send-now')
  async sendNow() {
    await this.svc.sendDigest();
    return { status: 'ok' };
  }

  @Post('send-critical')
  async sendCritical() {
    await this.svc.sendCriticalAlerts();
    return { status: 'ok' };
  }
}
