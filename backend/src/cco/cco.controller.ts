import {
  Controller,
  Get,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CcoService } from './cco.service';
import { RejectRequestDto } from '../admin/dto/admin-applicability-config.dto';
import { Body, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('CCO')
@ApiBearerAuth('JWT')
@Controller({ path: 'cco', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class CcoController {
  constructor(private readonly svc: CcoService) {}

  @ApiOperation({ summary: 'Get Dashboard' })
  @Get('dashboard')
  @Roles('CCO')
  getDashboard(@CurrentUser() user: ReqUser) {
    return this.svc.getDashboard(user);
  }

  @ApiOperation({ summary: 'Get Approvals' })
  @Get('approvals')
  @Roles('CCO')
  getApprovals(@CurrentUser() user: ReqUser) {
    return this.svc.getApprovals(user);
  }

  @ApiOperation({ summary: 'Approve Request' })
  @Post('approvals/:id/approve')
  @Roles('CCO')
  approveRequest(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    const numId = Number(id);
    if (isNaN(numId)) throw new BadRequestException('Invalid approval ID');
    return this.svc.approveRequest(user, numId);
  }

  @ApiOperation({ summary: 'Reject Request' })
  @Post('approvals/:id/reject')
  @Roles('CCO')
  rejectRequest(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: RejectRequestDto,
  ) {
    const numId = Number(id);
    if (isNaN(numId)) throw new BadRequestException('Invalid approval ID');
    return this.svc.rejectRequest(user, numId, body.remarks || '');
  }

  @ApiOperation({ summary: 'Get Crms Under Me' })
  @Get('crms-under-me')
  @Roles('CCO')
  getCrmsUnderMe(@CurrentUser() user: ReqUser) {
    return this.svc.getCrmsUnderMe(user);
  }

  @ApiOperation({ summary: 'Get Oversight' })
  @Get('oversight')
  @Roles('CCO')
  getOversight(@CurrentUser() user: ReqUser, @Query('status') status?: string) {
    return this.svc.getOversight(user, { status });
  }

  @ApiOperation({ summary: 'Get Oversight Delays' })
  @Get('oversight/delays')
  @Roles('CCO')
  getOversightDelays(@CurrentUser() user: ReqUser) {
    return this.svc.getOversightDelays(user);
  }

  @ApiOperation({ summary: 'Get Oversight Trends' })
  @Get('oversight/trends')
  @Roles('CCO')
  getOversightTrends(
    @CurrentUser() user: ReqUser,
    @Query('months') months?: string,
  ) {
    return this.svc.getOversightTrends(user, Number(months || 6));
  }
}
