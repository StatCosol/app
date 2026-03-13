import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CcoService } from './cco.service';
import { Body, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('CCO')
@ApiBearerAuth('JWT')
@Controller({ path: 'cco', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class CcoController {
  constructor(private readonly svc: CcoService) {}

  @ApiOperation({ summary: 'Get Dashboard' })
  @Get('dashboard')
  @Roles('CCO')
  getDashboard(@Req() req: any) {
    return this.svc.getDashboard(req.user);
  }

  @ApiOperation({ summary: 'Get Approvals' })
  @Get('approvals')
  @Roles('CCO')
  getApprovals(@Req() req: any) {
    return this.svc.getApprovals(req.user);
  }

  @ApiOperation({ summary: 'Approve Request' })
  @Post('approvals/:id/approve')
  @Roles('CCO')
  approveRequest(@Req() req: any, @Param('id') id: string) {
    return this.svc.approveRequest(req.user, Number(id));
  }

  @ApiOperation({ summary: 'Reject Request' })
  @Post('approvals/:id/reject')
  @Roles('CCO')
  rejectRequest(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.rejectRequest(req.user, Number(id), body.remarks);
  }

  @ApiOperation({ summary: 'Get Crms Under Me' })
  @Get('crms-under-me')
  @Roles('CCO')
  getCrmsUnderMe(@Req() req: any) {
    return this.svc.getCrmsUnderMe(req.user);
  }

  @ApiOperation({ summary: 'Get Oversight' })
  @Get('oversight')
  @Roles('CCO')
  getOversight(@Req() req: any, @Query('status') status?: string) {
    return this.svc.getOversight(req.user, { status });
  }

  @ApiOperation({ summary: 'Get Oversight Delays' })
  @Get('oversight/delays')
  @Roles('CCO')
  getOversightDelays(@Req() req: any) {
    return this.svc.getOversightDelays(req.user);
  }

  @ApiOperation({ summary: 'Get Oversight Trends' })
  @Get('oversight/trends')
  @Roles('CCO')
  getOversightTrends(@Req() req: any, @Query('months') months?: string) {
    return this.svc.getOversightTrends(req.user, Number(months || 6));
  }
}
