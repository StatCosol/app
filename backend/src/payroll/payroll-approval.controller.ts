import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PayrollApprovalService } from './payroll-approval.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Payroll')
@ApiBearerAuth('JWT')
@Controller({ path: 'payroll/runs', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PAYROLL', 'ADMIN')
export class PayrollApprovalController {
  constructor(private readonly approvalService: PayrollApprovalService) {}

  @ApiOperation({ summary: 'Submit' })
  @Post(':runId/submit')
  @Roles('PAYROLL', 'ADMIN', 'CLIENT')
  submit(
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.approvalService.submitForApproval(runId, user.userId, user);
  }

  @ApiOperation({ summary: 'Approve' })
  @Post(':runId/approve')
  @Roles('CCO')
  approve(
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body('comments') comments: string | undefined,
    @CurrentUser() user: ReqUser,
  ) {
    return this.approvalService.approveRun(runId, user.userId, comments, user);
  }

  @ApiOperation({ summary: 'Reject' })
  @Post(':runId/reject')
  @Roles('CCO')
  reject(
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body('reason') reason: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.approvalService.rejectRun(runId, user.userId, reason, user);
  }

  @ApiOperation({ summary: 'Revert' })
  @Post(':runId/revert')
  @Roles('PAYROLL', 'ADMIN')
  revert(
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.approvalService.revertToDraft(runId, user);
  }

  @ApiOperation({ summary: 'Status' })
  @Get(':runId/approval-status')
  @Roles('PAYROLL', 'CCO', 'ADMIN')
  status(
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.approvalService.getApprovalStatus(runId, user);
  }
}
