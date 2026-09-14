import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { OperationalScopeService } from '../access/operational-scope.service';
import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChecklistsService } from './checklists.service';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Checklists')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'checklists', version: '1' })
export class ChecklistsController {
  constructor(
    private readonly svc: ChecklistsService,
    private readonly scope: OperationalScopeService,
  ) {}

  @ApiOperation({ summary: 'Get By Branch' })
  @Get('branch/:branchId')
  @Roles('CRM', 'CLIENT', 'ADMIN', 'CCO', 'CEO')
  async getByBranch(
    @Param('branchId') branchId: string,
    @CurrentUser() user: ReqUser,
    @Query('status') status?: string,
  ) {
    await this.scope.resolve(user, undefined, branchId);
    return this.svc.getByBranch(branchId, status);
  }

  @ApiOperation({ summary: 'Branch Summary' })
  @Get('branch/:branchId/summary')
  @Roles('CRM', 'CLIENT', 'ADMIN', 'CCO', 'CEO')
  async branchSummary(
    @Param('branchId') branchId: string,
    @CurrentUser() user: ReqUser,
  ) {
    await this.scope.resolve(user, undefined, branchId);
    return this.svc.branchSummary(branchId);
  }

  @ApiOperation({ summary: 'Get By Client' })
  @Get('client/:clientId')
  @Roles('CRM', 'ADMIN', 'CCO', 'CEO')
  async getByClient(
    @Param('clientId') clientId: string,
    @CurrentUser() user: ReqUser,
  ) {
    await this.scope.resolve(user, clientId);
    return this.svc.getByClient(clientId);
  }

  @ApiOperation({ summary: 'Update Item' })
  @Patch(':id')
  @Roles('CRM', 'ADMIN')
  async updateItem(
    @Param('id') id: string,
    @CurrentUser() user: ReqUser,
    @Body()
    body: {
      isApplicable?: boolean;
      status?: string;
      reason?: string;
      ownerUserId?: string;
    },
  ) {
    await this.scope.assertRecord(user, await this.svc.getItem(id));
    return this.svc.updateItem(id, body);
  }
}
