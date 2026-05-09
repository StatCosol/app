import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminApprovalsService } from './admin-approvals.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Admin')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/approvals', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminApprovalsController {
  constructor(private readonly approvalsService: AdminApprovalsService) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  async list(@Query('status') status?: string) {
    return this.approvalsService.list(status);
  }

  @ApiOperation({ summary: 'Get Counts' })
  @Get('counts')
  async getCounts() {
    return this.approvalsService.getCounts();
  }

  @ApiOperation({ summary: 'Approve' })
  @Post(':id/approve')
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('notes') notes: string,
    @CurrentUser() user: ReqUser,
  ) {
    const approverId = user?.userId ?? user?.id;
    return this.approvalsService.approve(id, approverId, notes);
  }

  @ApiOperation({ summary: 'Reject' })
  @Post(':id/reject')
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('notes') notes: string,
    @CurrentUser() user: ReqUser,
  ) {
    const approverId = user?.userId ?? user?.id;
    return this.approvalsService.reject(id, approverId, notes);
  }
}
