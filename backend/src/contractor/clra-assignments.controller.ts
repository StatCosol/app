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
  Request,
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

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clra')
export class ClraAssignmentsController {
  constructor(private readonly svc: ClraAssignmentsService) {}

  // ─────────────── PE Establishments ───────────────

  @Get('pe-establishments')
  @Roles('ADMIN', 'CEO', 'CCO', 'CLIENT_ADMIN', 'CRM')
  listPeEstablishments(@Query('clientId') clientId: string) {
    return this.svc.listPeEstablishments(clientId);
  }

  @Post('pe-establishments')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  createPeEstablishment(@Body() dto: CreateClraPeEstablishmentDto) {
    return this.svc.createPeEstablishment(dto);
  }

  @Get('pe-establishments/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CLIENT_ADMIN', 'CRM')
  getPeEstablishment(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getPeEstablishment(id);
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
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT_ADMIN')
  listContractors() {
    return this.svc.listContractors();
  }

  @Post('contractors')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  createContractor(@Body() dto: CreateClraContractorDto) {
    return this.svc.createContractor(dto);
  }

  @Get('contractors/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT_ADMIN')
  getContractor(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getContractor(id);
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
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT_ADMIN')
  listAssignments(
    @Query('contractorId') contractorId: string,
    @Query('peEstablishmentId') peEstablishmentId: string,
  ) {
    return this.svc.listAssignments(contractorId, peEstablishmentId);
  }

  @Post('assignments')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  createAssignment(@Body() dto: CreateClraAssignmentDto) {
    return this.svc.createAssignment(dto);
  }

  @Get('assignments/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT_ADMIN')
  getAssignment(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getAssignment(id);
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
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT_ADMIN')
  listWorkers(@Query('contractorId') contractorId: string) {
    return this.svc.listWorkers(contractorId);
  }

  @Post('workers')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  createWorker(@Body() dto: CreateClraWorkerDto) {
    return this.svc.createWorker(dto);
  }

  @Get('workers/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT_ADMIN')
  getWorker(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getWorker(id);
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
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT_ADMIN')
  listDeployments(@Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return this.svc.listDeployments(assignmentId);
  }

  @Post('deployments')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  createDeployment(@Body() dto: CreateClraDeploymentDto) {
    return this.svc.createDeployment(dto);
  }

  @Get('deployments/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT_ADMIN')
  getDeployment(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getDeployment(id);
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
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT_ADMIN')
  listWagePeriods(@Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return this.svc.listWagePeriods(assignmentId);
  }

  @Post('wage-periods')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  createWagePeriod(@Body() dto: CreateClraWagePeriodDto) {
    return this.svc.createWagePeriod(dto);
  }

  @Get('wage-periods/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT_ADMIN')
  getWagePeriod(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getWagePeriod(id);
  }

  @Put('wage-periods/:id/close')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  closeWagePeriod(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.closeWagePeriod(id);
  }

  // ─────────────── Attendance ───────────────

  @Get('wage-periods/:wagePeriodId/attendance')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT_ADMIN')
  listAttendance(@Param('wagePeriodId', ParseUUIDPipe) wagePeriodId: string) {
    return this.svc.listAttendance(wagePeriodId);
  }

  @Post('attendance')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  upsertAttendance(@Body() dto: UpsertClraAttendanceDto) {
    return this.svc.upsertAttendance(dto);
  }

  // ─────────────── Wages ───────────────

  @Get('wage-periods/:wagePeriodId/wages')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT_ADMIN')
  listWages(@Param('wagePeriodId', ParseUUIDPipe) wagePeriodId: string) {
    return this.svc.listWages(wagePeriodId);
  }

  @Post('wages')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  upsertWage(@Body() dto: UpsertClraWageDto) {
    return this.svc.upsertWage(dto);
  }

  // ─────────────── Register Runs ───────────────

  @Get('assignments/:assignmentId/register-runs')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT_ADMIN')
  listRegisterRuns(@Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return this.svc.listRegisterRuns(assignmentId);
  }
}
