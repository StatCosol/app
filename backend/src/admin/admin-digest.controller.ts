import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminDigestService } from './admin-digest.service';

@Controller({ path: 'admin/reminders', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
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
