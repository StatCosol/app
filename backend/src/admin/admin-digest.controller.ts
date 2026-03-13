import { Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminDigestService } from './admin-digest.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

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
  async sendNow(@Req() req: any) {
    return this.svc.sendDigest(req.user?.userId || null, 'MANUAL');
  }

  @ApiOperation({ summary: 'Send Critical' })
  @Post('send-critical')
  async sendCritical(@Req() req: any) {
    return this.svc.sendCriticalAlerts(req.user?.userId || null, 'MANUAL');
  }
}
