import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TaskCenterService } from './task-center.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';

type TaskRole =
  | 'ADMIN'
  | 'CRM'
  | 'AUDITOR'
  | 'CLIENT'
  | 'BRANCH'
  | 'CONTRACTOR';
const GLOBAL_ROLES = new Set(['ADMIN', 'CEO', 'CCO', 'PAYROLL']);

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
  'CONTRACTOR',
)
@Controller({ path: 'tasks', version: '1' })
export class TaskCenterController {
  constructor(
    private readonly taskCenterService: TaskCenterService,
    private readonly accessScope: AccessScopeService,
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

  /**
   * Derive the task-center scope strictly from the JWT identity.
   * Query params for clientId / branchId / contractorId are accepted only
   * for global roles (ADMIN/CEO/CCO/PAYROLL) or after the user's allowed
   * client/branch lists are verified. For tenant-scoped roles the values
   * are forced to the user's own scope so a CLIENT/CONTRACTOR cannot
   * peek at another tenant's tasks by tampering with the query string.
   */
  private async resolveScope(
    user: ReqUser,
    q: { clientId?: string; branchId?: string; contractorId?: string },
  ): Promise<{
    role: TaskRole;
    userId: string;
    clientId: string | null;
    branchId: string | null;
    contractorId: string | null;
  }> {
    const role = this.deriveRole(user);
    const isGlobal = GLOBAL_ROLES.has(user.roleCode);

    let clientId: string | null = null;
    let branchId: string | null = null;
    let contractorId: string | null = null;

    if (isGlobal) {
      clientId = q.clientId ?? null;
      branchId = q.branchId ?? null;
      contractorId = q.contractorId ?? null;
    } else {
      // CLIENT (master/branch) — locked to own client, branch optional within own list
      if (user.roleCode === 'CLIENT') {
        clientId = user.clientId ?? null;
        if (q.branchId) {
          await this.accessScope.assertBranchAllowed(user, q.branchId);
          branchId = q.branchId;
        } else if (user.userType === 'BRANCH' && user.branchIds.length) {
          // BRANCH user with no branch query: scope to first allowed branch
          branchId = user.branchIds[0];
        }
      }
      // CRM / AUDITOR — restrict to assigned clients only
      else if (user.roleCode === 'CRM' || user.roleCode === 'AUDITOR') {
        if (q.clientId) {
          await this.accessScope.assertClientAllowed(user, q.clientId);
          clientId = q.clientId;
        }
        if (q.branchId) {
          await this.accessScope.assertBranchAllowed(user, q.branchId);
          branchId = q.branchId;
        }
      }
      // CONTRACTOR — locked to own user id; ignore any query contractorId override
      else if (user.roleCode === 'CONTRACTOR') {
        contractorId = user.userId;
      }
    }

    return {
      role,
      userId: user.userId,
      clientId,
      branchId,
      contractorId,
    };
  }

  private deriveRole(user: ReqUser): TaskRole {
    if (user.roleCode === 'CLIENT' && user.userType === 'BRANCH')
      return 'BRANCH';
    switch (user.roleCode) {
      case 'ADMIN':
      case 'CEO':
      case 'CCO':
      case 'PAYROLL':
        return 'ADMIN';
      case 'CRM':
        return 'CRM';
      case 'AUDITOR':
        return 'AUDITOR';
      case 'CLIENT':
        return 'CLIENT';
      case 'CONTRACTOR':
        return 'CONTRACTOR';
      default:
        return 'ADMIN';
    }
  }
}
