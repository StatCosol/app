import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
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

  @Get('crm')
  async listCrmAssignments() {
    return this.assignmentsService.listAssignmentsByType('CRM');
  }

  @Post('crm')
  async assignCrmCompat(
    @Body() body: { clientId: string; crmId: string },
    @Request() req,
  ) {
    return this.assignmentsService.changeAssignment({
      clientId: body.clientId,
      assignmentType: 'CRM',
      assignedToUserId: body.crmId,
      actorUserId: req.user?.userId ?? null,
      actorRole: req.user?.roleCode ?? null,
      changeReason: 'MANUAL',
    });
  }

  @Get('auditor')
  async listAuditorAssignments() {
    return this.assignmentsService.listAssignmentsByType('AUDITOR');
  }

  @Post('auditor')
  async assignAuditorCompat(
    @Body() body: { clientId: string; auditorId: string },
    @Request() req,
  ) {
    return this.assignmentsService.changeAssignment({
      clientId: body.clientId,
      assignmentType: 'AUDITOR',
      assignedToUserId: body.auditorId,
      actorUserId: req.user?.userId ?? null,
      actorRole: req.user?.roleCode ?? null,
      changeReason: 'MANUAL',
    });
  }

  // ---------------------------------------------------------------------------
  // Branch-wise Auditor Assignments (new)
  // ---------------------------------------------------------------------------

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

  @Post('branch-auditors')
  async assignAuditorToBranch(
    @Body() body: { clientId: string; branchId: string; auditorId: string },
    @Request() req,
  ) {
    return this.assignmentsService.assignAuditorToBranch({
      clientId: body.clientId,
      branchId: body.branchId,
      auditorUserId: body.auditorId,
      actorUserId: req.user?.userId ?? null,
      actorRole: req.user?.roleCode ?? null,
    });
  }

  @Delete('branch-auditors/:id')
  async endBranchAuditor(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req,
  ) {
    return this.assignmentsService.endBranchAuditorAssignment(id, {
      actorUserId: req.user?.userId ?? null,
      actorRole: req.user?.roleCode ?? null,
    });
  }

  @Get()
  async getAll() {
    this.logger.log('GET /api/admin/assignments');
    return this.assignmentsService.getCurrentAssignmentsGrouped();
  }

  @Post()
  async create(@Body() dto: CreateAssignmentDto, @Request() req) {
    this.logger.log('POST /api/admin/assignments', dto);
    return this.assignmentsService.createAssignment(
      dto,
      req.user.userId,
      req.user.roleCode,
    );
  }

  @Put(':clientId')
  async updateAssignment(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: CreateAssignmentDto,
    @Request() req,
  ) {
    return this.assignmentsService.updateAssignment(
      clientId,
      dto,
      req.user?.userId ?? null,
      req.user?.roleCode ?? null,
    );
  }

  @Get('current')
  async getCurrent() {
    return this.assignmentsService.getCurrentAssignments();
  }

  @Get('history')
  async getHistory(@Query('clientId') clientId?: string) {
    return this.assignmentsService.getAssignmentHistory(clientId);
  }

  // Per-client current assignments (admin)
  @Get('clients/:clientId/assignments/current')
  async getCurrentByClient(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query('assignmentType') assignmentType?: 'CRM' | 'AUDITOR',
  ) {
    return this.assignmentsService.getCurrentByClient(clientId, assignmentType);
  }

  // Per-client assignment history (admin)
  @Get('clients/:clientId/assignments/history')
  async getHistoryByClient(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Query('assignmentType') assignmentType?: 'CRM' | 'AUDITOR',
  ) {
    return this.assignmentsService.getHistoryByClient(clientId, assignmentType);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignmentDto,
    @Request() req,
  ) {
    return this.assignmentsService.update(
      id,
      dto,
      req.user.userId,
      req.user.roleCode,
    );
  }

  @Delete(':clientId')
  async unassignClient(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Request() req,
  ) {
    const actorUserId = req.user?.userId ?? null;

    await this.assignmentsService.changeAssignment({
      clientId,
      assignmentType: 'CRM',
      assignedToUserId: null,
      actorUserId,
      actorRole: req.user?.roleCode ?? null,
      changeReason: 'UNASSIGN',
    });

    await this.assignmentsService.changeAssignment({
      clientId,
      assignmentType: 'AUDITOR',
      assignedToUserId: null,
      actorUserId,
      actorRole: req.user?.roleCode ?? null,
      changeReason: 'UNASSIGN',
    });

    return { ok: true };
  }

  // New single-change endpoint for manual override
  @Post('clients/:clientId/assignments/change')
  async change(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: ChangeAssignmentDto,
    @Request() req,
  ) {
    return this.assignmentsService.changeAssignment({
      clientId,
      assignmentType: dto.assignmentType,
      assignedToUserId: dto.assignedToUserId,
      actorUserId: req.user?.userId ?? null,
      actorRole: req.user?.roleCode ?? null,
      changeReason: dto.changeReason,
    });
  }
}

@Controller({ path: 'crm/clients', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmClientsController {
  constructor(private assignmentsService: AssignmentsService) {}

  @Get('assigned')
  async getAssigned(@Request() req) {
    return this.assignmentsService.getAssignedClientsForCrm(req.user.userId);
  }
}

@Controller({ path: 'auditor/clients', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class AuditorClientsController {
  constructor(private assignmentsService: AssignmentsService) {}

  @Get('assigned')
  async getAssigned(@Request() req) {
    return this.assignmentsService.getAssignedClientsForAuditor(
      req.user.userId,
    );
  }
}
