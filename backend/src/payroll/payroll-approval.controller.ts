import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PayrollApprovalService } from './payroll-approval.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Payroll')
@ApiBearerAuth('JWT')
@Controller({ path: 'payroll/runs', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayrollApprovalController {
  constructor(private readonly approvalService: PayrollApprovalService) {}

  @ApiOperation({ summary: 'Submit' })
  @Post(':runId/submit')
  @Roles('PAYROLL', 'ADMIN', 'CLIENT')
  submit(@Param('runId', ParseUUIDPipe) runId: string, @Request() req: any) {
    return this.approvalService.submitForApproval(runId, req.user.userId);
  }

  @ApiOperation({ summary: 'Approve' })
  @Post(':runId/approve')
  @Roles('PAYROLL', 'ADMIN', 'CLIENT')
  approve(
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body('comments') comments: string | undefined,
    @Request() req: any,
  ) {
    return this.approvalService.approveRun(runId, req.user.userId, comments);
  }

  @ApiOperation({ summary: 'Reject' })
  @Post(':runId/reject')
  @Roles('ADMIN', 'CLIENT')
  reject(
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ) {
    return this.approvalService.rejectRun(runId, req.user.userId, reason);
  }

  @ApiOperation({ summary: 'Revert' })
  @Post(':runId/revert')
  @Roles('PAYROLL', 'ADMIN')
  revert(@Param('runId', ParseUUIDPipe) runId: string) {
    return this.approvalService.revertToDraft(runId);
  }

  @ApiOperation({ summary: 'Status' })
  @Get(':runId/approval-status')
  @Roles('PAYROLL', 'ADMIN', 'CLIENT')
  status(@Param('runId', ParseUUIDPipe) runId: string) {
    return this.approvalService.getApprovalStatus(runId);
  }
}
