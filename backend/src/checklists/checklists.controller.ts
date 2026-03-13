import { Controller, Get, Patch, Body, Param, Query } from '@nestjs/common';
import { ChecklistsService } from './checklists.service';
import { Roles } from '../auth/roles.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Checklists')
@ApiBearerAuth('JWT')
@Controller({ path: 'checklists', version: '1' })
export class ChecklistsController {
  constructor(private readonly svc: ChecklistsService) {}

  @ApiOperation({ summary: 'Get By Branch' })
  @Get('branch/:branchId')
  @Roles('CRM', 'CLIENT', 'ADMIN', 'CCO', 'CEO')
  getByBranch(
    @Param('branchId') branchId: string,
    @Query('status') status?: string,
  ) {
    return this.svc.getByBranch(branchId, status);
  }

  @ApiOperation({ summary: 'Branch Summary' })
  @Get('branch/:branchId/summary')
  @Roles('CRM', 'CLIENT', 'ADMIN', 'CCO', 'CEO')
  branchSummary(@Param('branchId') branchId: string) {
    return this.svc.branchSummary(branchId);
  }

  @ApiOperation({ summary: 'Get By Client' })
  @Get('client/:clientId')
  @Roles('CRM', 'ADMIN', 'CCO', 'CEO')
  getByClient(@Param('clientId') clientId: string) {
    return this.svc.getByClient(clientId);
  }

  @ApiOperation({ summary: 'Update Item' })
  @Patch(':id')
  @Roles('CRM', 'ADMIN')
  updateItem(
    @Param('id') id: string,
    @Body()
    body: {
      isApplicable?: boolean;
      status?: string;
      reason?: string;
      ownerUserId?: string;
    },
  ) {
    return this.svc.updateItem(id, body);
  }
}
