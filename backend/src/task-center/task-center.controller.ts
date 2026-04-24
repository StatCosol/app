import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TaskCenterService } from './task-center.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@ApiTags('Task Center')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'tasks', version: '1' })
export class TaskCenterController {
  constructor(private readonly taskCenterService: TaskCenterService) {}

  @ApiOperation({ summary: 'Get task summary for logged role context' })
  @Get('my-summary')
  getMySummary(
    @Query('role')
    role: 'ADMIN' | 'CRM' | 'AUDITOR' | 'CLIENT' | 'BRANCH' | 'CONTRACTOR',
    @Query('userId') userId?: string,
    @Query('clientId') clientId?: string,
    @Query('branchId') branchId?: string,
    @Query('contractorId') contractorId?: string,
  ) {
    return this.taskCenterService.getMySummary({
      role,
      userId,
      clientId,
      branchId,
      contractorId,
    });
  }

  @ApiOperation({ summary: 'Get task items for logged role context' })
  @Get('my-items')
  getMyItems(
    @Query('role')
    role: 'ADMIN' | 'CRM' | 'AUDITOR' | 'CLIENT' | 'BRANCH' | 'CONTRACTOR',
    @Query('userId') userId?: string,
    @Query('clientId') clientId?: string,
    @Query('branchId') branchId?: string,
    @Query('contractorId') contractorId?: string,
    @Query('status') status?: string,
  ) {
    return this.taskCenterService.getMyItems({
      role,
      userId,
      clientId,
      branchId,
      contractorId,
      status,
    });
  }

  @ApiOperation({ summary: 'Get overdue tasks for logged role context' })
  @Get('my-overdue')
  getMyOverdue(
    @Query('role')
    role: 'ADMIN' | 'CRM' | 'AUDITOR' | 'CLIENT' | 'BRANCH' | 'CONTRACTOR',
    @Query('userId') userId?: string,
    @Query('clientId') clientId?: string,
    @Query('branchId') branchId?: string,
    @Query('contractorId') contractorId?: string,
  ) {
    return this.taskCenterService.getOverdueItems({
      role,
      userId,
      clientId,
      branchId,
      contractorId,
    });
  }

  @ApiOperation({ summary: 'Get expiring tasks within given days' })
  @Get('my-expiring')
  getMyExpiring(
    @Query('role')
    role: 'ADMIN' | 'CRM' | 'AUDITOR' | 'CLIENT' | 'BRANCH' | 'CONTRACTOR',
    @Query('userId') userId?: string,
    @Query('clientId') clientId?: string,
    @Query('branchId') branchId?: string,
    @Query('contractorId') contractorId?: string,
    @Query('withinDays') withinDays?: string,
  ) {
    return this.taskCenterService.getExpiringItems({
      role,
      userId,
      clientId,
      branchId,
      contractorId,
      withinDays: withinDays ? Number(withinDays) : 7,
    });
  }
}
