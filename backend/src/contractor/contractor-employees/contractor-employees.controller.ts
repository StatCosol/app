import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';
import { ContractorEmployeesService } from './contractor-employees.service';
import { BranchAccessService } from '../../auth/branch-access.service';
import {
  CreateContractorEmployeeDto,
  UpdateContractorEmployeeDto,
} from './dto/contractor-employee.dto';

// ── Contractor-facing: manage own employees ─────────────
@ApiTags('Contractor Employees')
@ApiBearerAuth('JWT')
@Controller({ path: 'contractor/employees', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ContractorEmployeesController {
  constructor(
    private readonly svc: ContractorEmployeesService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  @ApiOperation({ summary: 'List own employees' })
  @Get()
  async list(
    @CurrentUser() user: ReqUser,
    @Query() query: Record<string, string>,
  ) {
    return this.svc.list(user.userId, {
      clientId: user.clientId || undefined,
      branchId: query.branchId || undefined,
      isActive:
        query.isActive === 'true'
          ? true
          : query.isActive === 'false'
            ? false
            : undefined,
      search: query.search || undefined,
    });
  }

  @ApiOperation({ summary: 'Create employee' })
  @Post()
  async create(
    @CurrentUser() user: ReqUser,
    @Body() body: CreateContractorEmployeeDto,
  ) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const branchId = body.branchId || user.branchIds?.[0];
    if (!branchId) throw new BadRequestException('Branch is required');
    await this.branchAccess.assertBranchAccess(user.userId, branchId);
    return this.svc.create(clientId, branchId, user.userId, body);
  }

  @ApiOperation({ summary: 'Get employee' })
  @Get(':id')
  async findOne(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.findById(id, user.userId);
  }

  @ApiOperation({ summary: 'Update employee' })
  @Put(':id')
  async update(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: UpdateContractorEmployeeDto,
  ) {
    return this.svc.update(id, user.userId, body);
  }

  @ApiOperation({ summary: 'Deactivate employee (mark as LEFT)' })
  @Put(':id/deactivate')
  async deactivate(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: { exitReason?: string },
  ) {
    return this.svc.deactivate(id, user.userId, body.exitReason);
  }

  @ApiOperation({
    summary: 'Request employee deletion (requires BranchDesk approval)',
  })
  @Post(':id/delete-request')
  async requestDelete(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.svc.requestDelete(id, user.userId, body.reason);
  }

  @ApiOperation({ summary: 'Reactivate previously exited employee' })
  @Put(':id/reactivate')
  async reactivate(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.reactivate(id, user.userId);
  }

  @ApiOperation({
    summary: 'Bulk-create employees (Excel upload, parsed client-side)',
  })
  @Post('bulk')
  async bulk(
    @CurrentUser() user: ReqUser,
    @Body() body: { branchId?: string; rows: any[] },
  ) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const defaultBranchId = body.branchId || user.branchIds?.[0];
    if (defaultBranchId) {
      await this.branchAccess.assertBranchAccess(user.userId, defaultBranchId);
    }
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const rowBranches = Array.from(
      new Set(
        rows
          .map((r) => (r && typeof r.branchId === 'string' ? r.branchId : null))
          .filter((b): b is string => !!b && b !== defaultBranchId),
      ),
    );
    for (const b of rowBranches) {
      await this.branchAccess.assertBranchAccess(user.userId, b);
    }
    return this.svc.bulkCreate(clientId, user.userId, defaultBranchId, rows);
  }
}

// ── Client/Branch-facing: view contractor employees ─────
@ApiTags('Contractor Employees')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/contractor-employees', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'ADMIN', 'CRM', 'BRANCH_DESK')
export class ClientContractorEmployeesController {
  constructor(
    private readonly svc: ContractorEmployeesService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  @ApiOperation({ summary: 'List contractor employees for a branch' })
  @Get()
  async list(
    @CurrentUser() user: ReqUser,
    @Query() query: Record<string, string>,
  ) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const branchId = query.branchId || user.branchIds?.[0];
    if (!branchId) throw new BadRequestException('Branch is required');

    const allowed = await this.branchAccess.getAllowedBranchIds(
      user.userId,
      clientId,
    );
    if (allowed !== 'ALL' && !allowed.includes(branchId)) {
      return { data: [], total: 0 };
    }

    return this.svc.listByBranch(clientId, branchId, {
      contractorUserId: query.contractorUserId || undefined,
      isActive:
        query.isActive === 'true'
          ? true
          : query.isActive === 'false'
            ? false
            : undefined,
      search: query.search || undefined,
    });
  }

  @ApiOperation({
    summary:
      'List pending contractor employee delete requests for branch approval',
  })
  @Get('delete-requests')
  async listDeleteRequests(@CurrentUser() user: ReqUser) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const allowed = await this.branchAccess.getAllowedBranchIds(
      user.userId,
      clientId,
    );
    return this.svc.listPendingDeleteRequests(clientId, allowed);
  }

  @ApiOperation({
    summary: 'Approve or reject a contractor employee delete request',
  })
  @Post('delete-requests/:id/review')
  async reviewDeleteRequest(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body()
    body: {
      decision: 'APPROVED' | 'REJECTED';
      notes?: string | null;
    },
  ) {
    const clientId = user.clientId;
    if (!clientId) throw new BadRequestException('Client context required');
    const allowed = await this.branchAccess.getAllowedBranchIds(
      user.userId,
      clientId,
    );
    return this.svc.reviewDeleteRequest(
      clientId,
      id,
      user.userId,
      body.decision,
      body.notes ?? null,
      allowed,
    );
  }
}
