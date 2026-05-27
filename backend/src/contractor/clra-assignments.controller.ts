import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ClraAssignmentsService } from './clra-assignments.service';
import {
  CreateClraPeEstablishmentDto,
  CreateClraContractorDto,
  CreateClraAssignmentDto,
  CreateClraWorkerDto,
  CreateClraDeploymentDto,
  CreateClraWagePeriodDto,
  UpsertClraAttendanceDto,
  UpsertClraWageDto,
} from './clra-assignments.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clra')
export class ClraAssignmentsController {
  constructor(private readonly svc: ClraAssignmentsService) {}

  private clientScope(user: ReqUser): string | undefined {
    return user.roleCode === 'CLIENT' ? user.clientId || undefined : undefined;
  }

  // ─────────────── PE Establishments ───────────────

  @Get('pe-establishments')
  @Roles('ADMIN', 'CEO', 'CCO', 'CLIENT', 'CRM')
  listPeEstablishments(
    @CurrentUser() user: ReqUser,
    @Query('clientId') clientId: string,
  ) {
    return this.svc.listPeEstablishments(this.clientScope(user) || clientId);
  }

  @Post('pe-establishments')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  createPeEstablishment(@Body() dto: CreateClraPeEstablishmentDto) {
    return this.svc.createPeEstablishment(dto);
  }

  @Get('pe-establishments/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CLIENT', 'CRM')
  getPeEstablishment(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getPeEstablishmentScoped(id, this.clientScope(user));
  }

  @Put('pe-establishments/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  updatePeEstablishment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateClraPeEstablishmentDto>,
  ) {
    return this.svc.updatePeEstablishment(id, dto);
  }

  // ─────────────── Contractors ───────────────

  @Get('contractors')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  listContractors(@CurrentUser() user: ReqUser) {
    const clientId = this.clientScope(user);
    if (clientId) return this.svc.listContractorsForClient(clientId);
    return this.svc.listContractors();
  }

  @Post('contractors')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  createContractor(@Body() dto: CreateClraContractorDto) {
    return this.svc.createContractor(dto);
  }

  @Get('contractors/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  getContractor(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getContractorScoped(id, this.clientScope(user));
  }

  @Put('contractors/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  updateContractor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateClraContractorDto>,
  ) {
    return this.svc.updateContractor(id, dto);
  }

  // ─────────────── Assignments ───────────────

  @Get('assignments')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  listAssignments(
    @CurrentUser() user: ReqUser,
    @Query('contractorId') contractorId: string,
    @Query('peEstablishmentId') peEstablishmentId: string,
  ) {
    return this.svc.listAssignments(
      contractorId,
      peEstablishmentId,
      this.clientScope(user),
    );
  }

  @Post('assignments')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  createAssignment(@Body() dto: CreateClraAssignmentDto) {
    return this.svc.createAssignment(dto);
  }

  @Get('assignments/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  getAssignment(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getAssignmentScoped(id, this.clientScope(user));
  }

  @Put('assignments/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  updateAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateClraAssignmentDto>,
  ) {
    return this.svc.updateAssignment(id, dto);
  }

  // ─────────────── Workers ───────────────

  @Get('workers')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async listWorkers(
    @CurrentUser() user: ReqUser,
    @Query('contractorId') contractorId: string,
  ) {
    await this.svc.assertReadableContractor(contractorId, this.clientScope(user));
    return this.svc.listWorkers(contractorId);
  }

  @Post('workers')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  createWorker(@Body() dto: CreateClraWorkerDto) {
    return this.svc.createWorker(dto);
  }

  @Get('workers/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  getWorker(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getWorkerScoped(id, this.clientScope(user));
  }

  @Put('workers/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  updateWorker(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateClraWorkerDto>,
  ) {
    return this.svc.updateWorker(id, dto);
  }

  // ─────────────── Deployments ───────────────

  @Get('assignments/:assignmentId/deployments')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async listDeployments(
    @CurrentUser() user: ReqUser,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    await this.svc.assertReadableAssignment(
      assignmentId,
      this.clientScope(user),
    );
    return this.svc.listDeployments(assignmentId);
  }

  @Post('deployments')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  createDeployment(@Body() dto: CreateClraDeploymentDto) {
    return this.svc.createDeployment(dto);
  }

  @Get('deployments/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  getDeployment(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getDeploymentScoped(id, this.clientScope(user));
  }

  @Put('deployments/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  updateDeployment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateClraDeploymentDto>,
  ) {
    return this.svc.updateDeployment(id, dto);
  }

  // ─────────────── Wage Periods ───────────────

  @Get('assignments/:assignmentId/wage-periods')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async listWagePeriods(
    @CurrentUser() user: ReqUser,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    await this.svc.assertReadableAssignment(
      assignmentId,
      this.clientScope(user),
    );
    return this.svc.listWagePeriods(assignmentId);
  }

  @Post('wage-periods')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  createWagePeriod(@Body() dto: CreateClraWagePeriodDto) {
    return this.svc.createWagePeriod(dto);
  }

  @Get('wage-periods/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  getWagePeriod(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getWagePeriodScoped(id, this.clientScope(user));
  }

  @Put('wage-periods/:id/close')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  closeWagePeriod(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.closeWagePeriod(id);
  }

  // ─────────────── Attendance ───────────────

  @Get('wage-periods/:wagePeriodId/attendance')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async listAttendance(
    @CurrentUser() user: ReqUser,
    @Param('wagePeriodId', ParseUUIDPipe) wagePeriodId: string,
  ) {
    await this.svc.assertReadableWagePeriod(
      wagePeriodId,
      this.clientScope(user),
    );
    return this.svc.listAttendance(wagePeriodId);
  }

  @Post('attendance')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  upsertAttendance(@Body() dto: UpsertClraAttendanceDto) {
    return this.svc.upsertAttendance(dto);
  }

  // ─────────────── Wages ───────────────

  @Get('wage-periods/:wagePeriodId/wages')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async listWages(
    @CurrentUser() user: ReqUser,
    @Param('wagePeriodId', ParseUUIDPipe) wagePeriodId: string,
  ) {
    await this.svc.assertReadableWagePeriod(
      wagePeriodId,
      this.clientScope(user),
    );
    return this.svc.listWages(wagePeriodId);
  }

  @Post('wages')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  upsertWage(@Body() dto: UpsertClraWageDto) {
    return this.svc.upsertWage(dto);
  }

  // ─────────────── Register Runs ───────────────

  @Get('assignments/:assignmentId/register-runs')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async listRegisterRuns(
    @CurrentUser() user: ReqUser,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    await this.svc.assertReadableAssignment(
      assignmentId,
      this.clientScope(user),
    );
    return this.svc.listRegisterRuns(assignmentId);
  }
}
