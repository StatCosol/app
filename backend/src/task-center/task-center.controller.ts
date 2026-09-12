import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TaskCenterService } from './task-center.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { OperationalScopeService } from '../access/operational-scope.service';

type TaskRole =
  | 'ADMIN'
  | 'CCO'
  | 'PAYROLL'
  | 'CRM'
  | 'AUDITOR'
  | 'CLIENT'
  | 'BRANCH'
  | 'CONTRACTOR';

@ApiTags('Task Center')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  'ADMIN',
  'CEO',
  'CCO',
  'PAYROLL',
  'CRM',
  'AUDITOR',
  'CLIENT',
  'BRANCH_DESK',
  'CONTRACTOR',
)
@Controller({ path: 'tasks', version: '1' })
export class TaskCenterController {
  constructor(
    private readonly taskCenterService: TaskCenterService,
    private readonly accessScope: OperationalScopeService,
  ) {}

  @ApiOperation({ summary: 'Get task summary for logged-in user' })
  @Get('my-summary')
  async getMySummary(
    @CurrentUser() user: ReqUser,
    @Query('clientId') clientId?: string,
    @Query('branchId') branchId?: string,
    @Query('contractorId') contractorId?: string,
  ) {
    const scope = await this.resolveScope(user, {
      clientId,
      branchId,
      contractorId,
    });
    return this.taskCenterService.getMySummary(scope);
  }

  @ApiOperation({ summary: 'Get task items for logged-in user' })
  @Get('my-items')
  async getMyItems(
    @CurrentUser() user: ReqUser,
    @Query('clientId') clientId?: string,
    @Query('branchId') branchId?: string,
    @Query('contractorId') contractorId?: string,
    @Query('status') status?: string,
  ) {
    const scope = await this.resolveScope(user, {
      clientId,
      branchId,
      contractorId,
    });
    return this.taskCenterService.getMyItems({ ...scope, status });
  }

  @ApiOperation({ summary: 'Get overdue tasks for logged-in user' })
  @Get('my-overdue')
  async getMyOverdue(
    @CurrentUser() user: ReqUser,
    @Query('clientId') clientId?: string,
    @Query('branchId') branchId?: string,
    @Query('contractorId') contractorId?: string,
  ) {
    const scope = await this.resolveScope(user, {
      clientId,
      branchId,
      contractorId,
    });
    return this.taskCenterService.getOverdueItems(scope);
  }

  @ApiOperation({ summary: 'Get expiring tasks within given days' })
  @Get('my-expiring')
  async getMyExpiring(
    @CurrentUser() user: ReqUser,
    @Query('clientId') clientId?: string,
    @Query('branchId') branchId?: string,
    @Query('contractorId') contractorId?: string,
    @Query('withinDays') withinDays?: string,
  ) {
    const scope = await this.resolveScope(user, {
      clientId,
      branchId,
      contractorId,
    });
    return this.taskCenterService.getExpiringItems({
      ...scope,
      withinDays: withinDays ? Number(withinDays) : 7,
    });
  }

  /** Resolve every queue from the same current company and branch assignments. */
  private async resolveScope(
    user: ReqUser,
    q: { clientId?: string; branchId?: string; contractorId?: string },
  ) {
    const role = this.deriveRole(user);
    const userId = user.userId || user.id;
    if (!userId) throw new ForbiddenException('User identity is required');
    const scope = await this.accessScope.resolve(user, q.clientId, q.branchId);
    return {
      role,
      // Keep legacy ADMIN queue entries inside the caller's company/module scope.
      ...(role === 'CCO' ? { assignedRoles: ['CCO', 'ADMIN'] } : {}),
      ...(role === 'PAYROLL'
        ? { assignedRoles: ['PAYROLL', 'ADMIN'], taskModules: ['PAYROLL'] }
        : {}),
      userId,
      clientId: q.clientId || scope.clientId || null,
      ...(scope.level === 'clients'
        ? { clientIds: scope.clientIds || [] }
        : {}),
      branchId: q.branchId || null,
      ...(scope.level === 'branches' && !q.branchId
        ? { branchIds: scope.branchIds || [] }
        : {}),
      contractorId: role === 'CONTRACTOR' ? userId : q.contractorId || null,
    };
  }

  private deriveRole(user: ReqUser): TaskRole {
    if (
      user.roleCode === 'BRANCH_DESK' ||
      (user.roleCode === 'CLIENT' && user.userType === 'BRANCH')
    )
      return 'BRANCH';
    switch (user.roleCode) {
      case 'CEO':
        return 'ADMIN';
      case 'ADMIN':
      case 'CCO':
      case 'PAYROLL':
      case 'CRM':
      case 'AUDITOR':
      case 'CLIENT':
      case 'CONTRACTOR':
        return user.roleCode;
      default:
        throw new ForbiddenException('Role has no task queue');
    }
  }
}
