import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminDigestService } from './admin-digest.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Admin')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/reminders', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminDigestController {
  constructor(private readonly svc: AdminDigestService) {}

  @ApiOperation({ summary: 'Digest Config' })
  @Get('config')
  getConfig() {
    return this.svc.getConfig();
  }

  @ApiOperation({ summary: 'Digest Preview' })
  @Get('preview')
  getPreview() {
    return this.svc.getPreview();
  }

  @ApiOperation({ summary: 'Digest History' })
  @Get('history')
  getHistory(@Query('limit') limit?: string) {
    return this.svc.getHistory(Number(limit) || 30);
  }

  @ApiOperation({ summary: 'Send Now' })
  @Post('send-now')
  async sendNow(@CurrentUser() user: ReqUser) {
    return this.svc.sendDigest(user?.userId || null, 'MANUAL');
  }

  @ApiOperation({ summary: 'Send Critical' })
  @Post('send-critical')
  async sendCritical(@CurrentUser() user: ReqUser) {
    return this.svc.sendCriticalAlerts(user?.userId || null, 'MANUAL');
  }
}
