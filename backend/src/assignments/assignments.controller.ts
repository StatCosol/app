import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Put,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { ChangeAssignmentDto } from './dto/change-assignment.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Assignments')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/assignments', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AssignmentsController {
  private readonly logger = new Logger(AssignmentsController.name);
  constructor(private assignmentsService: AssignmentsService) {}

  // --- Compatibility endpoints for the existing Angular Admin UI ---
  // Frontend uses:
  //   GET  /api/admin/assignments/crm
  //   POST /api/admin/assignments/crm      { clientId, crmId }

  //   GET  /api/admin/assignments/auditor
  //   POST /api/admin/assignments/auditor  { clientId, auditorId }

  @ApiOperation({ summary: 'List Crm Assignments' })
  @Get('crm')
  async listCrmAssignments() {
    return this.assignmentsService.listAssignmentsByType('CRM');
  }

  @ApiOperation({ summary: 'Assign Crm Compat' })
  @Post('crm')
  async assignCrmCompat(
    @Body() body: { clientId: string; crmId: string },
    @CurrentUser() user: ReqUser,
  ) {
    return this.assignmentsService.changeAssignment({
      clientId: body.clientId,
      assignmentType: 'CRM',
      assignedToUserId: body.crmId,
      actorUserId: user?.userId ?? null,
      actorRole: user?.roleCode ?? null,
      changeReason: 'MANUAL',
    });
  }

  @ApiOperation({ summary: 'List Auditor Assignments' })
  @Get('auditor')
  async listAuditorAssignments() {
    return this.assignmentsService.listAssignmentsByType('AUDITOR');
  }

  @ApiOperation({ summary: 'Assign Auditor Compat' })
  @Post('auditor')
  async assignAuditorCompat(
    @Body() body: { clientId: string; auditorId: string },
    @CurrentUser() user: ReqUser,
  ) {
    return this.assignmentsService.changeAssignment({
      clientId: body.clientId,
      assignmentType: 'AUDITOR',
      assignedToUserId: body.auditorId,
      actorUserId: user?.userId ?? null,
      actorRole: user?.roleCode ?? null,
      changeReason: 'MANUAL',
    });
  }

  // ---------------------------------------------------------------------------
  // Branch-wise Auditor Assignments (new)
  // ---------------------------------------------------------------------------

  @ApiOperation({ summary: 'List Branch Auditors' })
  @Get('branch-auditors')
  async listBranchAuditors(
    @Query('clientId') clientId?: string,
    @Query('auditorUserId') auditorUserId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.assignmentsService.listBranchAuditorAssignments({
      clientId,
      auditorUserId,
      branchId,
      activeOnly: true,
    });
  }

  @ApiOperation({ summary: 'Assign Auditor To Branch' })
  @Post('branch-auditors')
  async assignAuditorToBranch(
    @Body() body: { clientId: string; branchId: string; auditorId: string },
    @CurrentUser() user: ReqUser,
  ) {
    return this.assignmentsService.assignAuditorToBranch({
      clientId: body.clientId,
      branchId: body.branchId,
      auditorUserId: body.auditorId,
      actorUserId: user?.userId ?? null,
      actorRole: user?.roleCode ?? null,
    });
  }

  @ApiOperation({ summary: 'End Branch Auditor' })
  @Delete('branch-auditors/:id')
  async endBranchAuditor(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: ReqUser,
  ) {
    return this.assignmentsService.endBranchAuditorAssignment(id, {
      actorUserId: user?.userId ?? null,
      actorRole: user?.roleCode ?? null,
    });
  }

  @ApiOperation({ summary: 'Get All' })
  @Get()
  async getAll() {
    this.logger.log('GET /api/admin/assignments');
    return this.assignmentsService.getCurrentAssignmentsGrouped();
  }

  @ApiOperation({ summary: 'Create' })
  @Post()
  async create(@Body() dto: CreateAssignmentDto, @CurrentUser() user: ReqUser) {
    this.logger.log('POST /api/admin/assignments', dto);
    return this.assignmentsService.createAssignment(
      dto,
      user.userId,
      user.roleCode,
    );
  }

  @ApiOperation({ summary: 'Update Assignment' })
  @Put(':clientId')
  async updateAssignment(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.assignmentsService.updateAssignment(
      clientId,
      dto,
      user?.userId ?? null,
      user?.roleCode ?? null,
    );
  }

  @ApiOperation({ summary: 'Get Current' })
  @Get('current')
  async getCurrent() {
    return this.assignmentsService.getCurrentAssignments();
  }

  @ApiOperation({ summary: 'Get History' })
  @Get('history')
  async getHistory(@Query('clientId') clientId?: string) {
    return this.assignmentsService.getAssignmentHistory(clientId);
  }

  // Per-client current assignments (admin)
  @ApiOperation({ summary: 'Get Current By Client' })
  @Get('clients/:clientId/assignments/current')
  async getCurrentByClient(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query('assignmentType') assignmentType?: 'CRM' | 'AUDITOR',
  ) {
    return this.assignmentsService.getCurrentByClient(clientId, assignmentType);
  }

  // Per-client assignment history (admin)
  @ApiOperation({ summary: 'Get History By Client' })
  @Get('clients/:clientId/assignments/history')
  async getHistoryByClient(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query('assignmentType') assignmentType?: 'CRM' | 'AUDITOR',
  ) {
    return this.assignmentsService.getHistoryByClient(clientId, assignmentType);
  }

  @ApiOperation({ summary: 'Update' })
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignmentDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.assignmentsService.update(id, dto, user.userId, user.roleCode);
  }

  @ApiOperation({ summary: 'Unassign Client' })
  @Delete(':clientId')
  async unassignClient(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @CurrentUser() user: ReqUser,
  ) {
    const actorUserId = user?.userId ?? null;

    await this.assignmentsService.changeAssignment({
      clientId,
      assignmentType: 'CRM',
      assignedToUserId: null,
      actorUserId,
      actorRole: user?.roleCode ?? null,
      changeReason: 'UNASSIGN',
    });

    await this.assignmentsService.changeAssignment({
      clientId,
      assignmentType: 'AUDITOR',
      assignedToUserId: null,
      actorUserId,
      actorRole: user?.roleCode ?? null,
      changeReason: 'UNASSIGN',
    });

    return { ok: true };
  }

  // New single-change endpoint for manual override
  @ApiOperation({ summary: 'Change' })
  @Post('clients/:clientId/assignments/change')
  async change(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: ChangeAssignmentDto,
    @CurrentUser() user: ReqUser,
  ) {
    return this.assignmentsService.changeAssignment({
      clientId,
      assignmentType: dto.assignmentType,
      assignedToUserId: dto.assignedToUserId,
      actorUserId: user?.userId ?? null,
      actorRole: user?.roleCode ?? null,
      changeReason: dto.changeReason,
    });
  }
}

@Controller({ path: 'crm/clients', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmClientsController {
  constructor(private assignmentsService: AssignmentsService) {}

  @ApiOperation({ summary: 'Get Assigned' })
  @Get('assigned')
  async getAssigned(@CurrentUser() user: ReqUser) {
    return this.assignmentsService.getAssignedClientsForCrm(user.userId);
  }
}

@Controller({ path: 'auditor/clients', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class AuditorClientsController {
  constructor(private assignmentsService: AssignmentsService) {}

  @ApiOperation({ summary: 'Get Assigned' })
  @Get('assigned')
  async getAssigned(@CurrentUser() user: ReqUser) {
    return this.assignmentsService.getAssignedClientsForAuditor(user.userId);
  }
}
