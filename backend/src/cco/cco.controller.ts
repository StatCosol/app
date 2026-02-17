import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CcoService } from './cco.service';
import { Body, Param, Post } from '@nestjs/common';

@Controller({ path: 'cco', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class CcoController {
  constructor(private readonly svc: CcoService) {}

  @Get('dashboard')
  @Roles('CCO')
  getDashboard(@Req() req: any) {
    return this.svc.getDashboard(req.user);
  }

  @Get('approvals')
  @Roles('CCO')
  getApprovals(@Req() req: any) {
    return this.svc.getApprovals(req.user);
  }

  @Post('approvals/:id/approve')
  @Roles('CCO')
  approveRequest(@Req() req: any, @Param('id') id: string) {
    return this.svc.approveRequest(req.user, Number(id));
  }

  @Post('approvals/:id/reject')
  @Roles('CCO')
  rejectRequest(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.rejectRequest(req.user, Number(id), body.remarks);
  }

  @Get('crms-under-me')
  @Roles('CCO')
  getCrmsUnderMe(@Req() req: any) {
    return this.svc.getCrmsUnderMe(req.user);
  }

  @Get('oversight')
  @Roles('CCO')
  getOversight(@Req() req: any) {
    return this.svc.getOversight(req.user);
  }
}
