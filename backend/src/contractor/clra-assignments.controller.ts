import {
  BadRequestException,
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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import {
  assertSafeFileOnDisk,
  makeSafeUploadOptions,
} from '../common/safe-upload';
import { ClraAssignmentsService } from './clra-assignments.service';
import { ClraAccessService } from './clra-access.service';
import {
  CreateClraPeEstablishmentDto,
  CreateClraContractorDto,
  CreateClraAssignmentDto,
  CreateClraWorkerDto,
  CreateClraDeploymentDto,
  CreateClraWagePeriodDto,
  UpsertClraAttendanceDto,
  UpsertClraWageDto,
  CreateClraRegisterRunDto,
  UpdateClraPeEstablishmentDto,
  UpdateClraContractorDto,
  UpdateClraAssignmentDto,
  UpdateClraWorkerDto,
  UpdateClraDeploymentDto,
} from './clra-assignments.dto';

/**
 * Every route checks the caller against the record's owning client (and
 * branch) through ClraAccessService. They used to act on ids alone and list
 * without a client filter: a CLIENT user could read every company's CLRA data
 * and a CRM could edit any of it. Ids in request bodies are checked too — they
 * decide which company's chain a new record joins.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clra')
export class ClraAssignmentsController {
  constructor(
    private readonly svc: ClraAssignmentsService,
    private readonly scope: ClraAccessService,
  ) {}

  // ─────────────── PE Establishments ───────────────

  @Get('pe-establishments')
  @Roles('ADMIN', 'CEO', 'CCO', 'CLIENT', 'CRM')
  async listPeEstablishments(
    @CurrentUser() user: ReqUser,
    @Query('clientId') clientId?: string,
  ) {
    return this.svc.listPeEstablishments(
      clientId,
      await this.scope.listScope(user),
    );
  }

  @Post('pe-establishments')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async createPeEstablishment(
    @CurrentUser() user: ReqUser,
    @Body() dto: CreateClraPeEstablishmentDto,
  ) {
    await this.scope.assertBodyRefs(user, dto);
    return this.svc.createPeEstablishment(dto);
  }

  @Get('pe-establishments/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CLIENT', 'CRM')
  async getPeEstablishment(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.scope.assertPe(user, id);
    return this.svc.getPeEstablishment(id);
  }

  @Put('pe-establishments/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async updatePeEstablishment(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClraPeEstablishmentDto,
  ) {
    await this.scope.assertPe(user, id);
    await this.scope.assertBodyRefs(user, dto);
    return this.svc.updatePeEstablishment(id, dto);
  }

  // ─────────────── Contractors ───────────────

  @Get('contractors')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async listContractors(@CurrentUser() user: ReqUser) {
    return this.svc.listContractors(
      await this.scope.listScope(user),
      user.roleCode === 'CRM',
    );
  }

  @Post('contractors')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  createContractor(@Body() dto: CreateClraContractorDto) {
    return this.svc.createContractor(dto);
  }

  @Get('contractors/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async getContractor(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.scope.assertContractor(user, id);
    return this.svc.getContractor(id);
  }

  @Put('contractors/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async updateContractor(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClraContractorDto,
  ) {
    await this.scope.assertContractor(user, id);
    return this.svc.updateContractor(id, dto);
  }

  // ─────────────── Assignments ───────────────

  @Get('assignments')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async listAssignments(
    @CurrentUser() user: ReqUser,
    @Query('contractorId') contractorId?: string,
    @Query('peEstablishmentId') peEstablishmentId?: string,
  ) {
    return this.svc.listAssignments(
      contractorId,
      peEstablishmentId,
      await this.scope.listScope(user),
    );
  }

  @Post('assignments')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async createAssignment(
    @CurrentUser() user: ReqUser,
    @Body() dto: CreateClraAssignmentDto,
  ) {
    await this.scope.assertBodyRefs(user, dto);
    return this.svc.createAssignment(dto);
  }

  @Get('assignments/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async getAssignment(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.scope.assertAssignment(user, id);
    return this.svc.getAssignment(id);
  }

  @Put('assignments/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async updateAssignment(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClraAssignmentDto,
  ) {
    await this.scope.assertAssignment(user, id);
    await this.scope.assertBodyRefs(user, dto);
    return this.svc.updateAssignment(id, dto);
  }

  // ─────────────── Workers ───────────────

  @Get('workers')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async listWorkers(
    @CurrentUser() user: ReqUser,
    @Query('contractorId') contractorId?: string,
  ) {
    // listWorkers(undefined) matched every worker of every contractor.
    if (!contractorId) {
      if (await this.scope.listScope(user))
        throw new BadRequestException('contractorId is required');
    } else {
      await this.scope.assertContractor(user, contractorId);
    }
    return this.svc.listWorkers(contractorId as string);
  }

  @Post('workers')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async createWorker(
    @CurrentUser() user: ReqUser,
    @Body() dto: CreateClraWorkerDto,
  ) {
    await this.scope.assertBodyRefs(user, dto);
    return this.svc.createWorker(dto);
  }

  @Get('workers/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async getWorker(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.scope.assertWorker(user, id);
    return this.svc.getWorker(id);
  }

  @Put('workers/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async updateWorker(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClraWorkerDto,
  ) {
    await this.scope.assertWorker(user, id);
    await this.scope.assertBodyRefs(user, dto);
    return this.svc.updateWorker(id, dto);
  }

  // ─────────────── Deployments ───────────────

  @Get('assignments/:assignmentId/deployments')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async listDeployments(
    @CurrentUser() user: ReqUser,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    await this.scope.assertAssignment(user, assignmentId);
    return this.svc.listDeployments(assignmentId);
  }

  @Post('deployments')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async createDeployment(
    @CurrentUser() user: ReqUser,
    @Body() dto: CreateClraDeploymentDto,
  ) {
    await this.scope.assertBodyRefs(user, dto);
    return this.svc.createDeployment(dto);
  }

  @Get('deployments/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async getDeployment(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.scope.assertDeployment(user, id);
    return this.svc.getDeployment(id);
  }

  @Put('deployments/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async updateDeployment(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClraDeploymentDto,
  ) {
    await this.scope.assertDeployment(user, id);
    await this.scope.assertBodyRefs(user, dto);
    return this.svc.updateDeployment(id, dto);
  }

  // ─────────────── Wage Periods ───────────────

  @Get('assignments/:assignmentId/wage-periods')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async listWagePeriods(
    @CurrentUser() user: ReqUser,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    await this.scope.assertAssignment(user, assignmentId);
    return this.svc.listWagePeriods(assignmentId);
  }

  @Post('wage-periods')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async createWagePeriod(
    @CurrentUser() user: ReqUser,
    @Body() dto: CreateClraWagePeriodDto,
  ) {
    await this.scope.assertBodyRefs(user, dto);
    return this.svc.createWagePeriod(dto);
  }

  @Get('wage-periods/:id')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async getWagePeriod(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.scope.assertWagePeriod(user, id);
    return this.svc.getWagePeriod(id);
  }

  @Put('wage-periods/:id/close')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async closeWagePeriod(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.scope.assertWagePeriod(user, id);
    return this.svc.closeWagePeriod(id);
  }

  // ─────────────── Attendance ───────────────

  @Get('wage-periods/:wagePeriodId/attendance')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async listAttendance(
    @CurrentUser() user: ReqUser,
    @Param('wagePeriodId', ParseUUIDPipe) wagePeriodId: string,
  ) {
    await this.scope.assertWagePeriod(user, wagePeriodId);
    return this.svc.listAttendance(wagePeriodId);
  }

  @Post('attendance')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async upsertAttendance(
    @CurrentUser() user: ReqUser,
    @Body() dto: UpsertClraAttendanceDto,
  ) {
    await this.scope.assertBodyRefs(user, dto);
    return this.svc.upsertAttendance(dto);
  }

  // ─────────────── Wages ───────────────

  @Get('wage-periods/:wagePeriodId/wages')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async listWages(
    @CurrentUser() user: ReqUser,
    @Param('wagePeriodId', ParseUUIDPipe) wagePeriodId: string,
  ) {
    await this.scope.assertWagePeriod(user, wagePeriodId);
    return this.svc.listWages(wagePeriodId);
  }

  @Post('wages')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async upsertWage(
    @CurrentUser() user: ReqUser,
    @Body() dto: UpsertClraWageDto,
  ) {
    await this.scope.assertBodyRefs(user, dto);
    return this.svc.upsertWage(dto);
  }

  // ─────────────── Register Runs ───────────────

  @Get('assignments/:assignmentId/register-runs')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT')
  async listRegisterRuns(
    @CurrentUser() user: ReqUser,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    await this.scope.assertAssignment(user, assignmentId);
    return this.svc.listRegisterRuns(assignmentId);
  }

  @Post('register-runs')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  async createRegisterRun(
    @Body() dto: CreateClraRegisterRunDto,
    @CurrentUser() user: ReqUser,
  ) {
    await this.scope.assertBodyRefs(user, dto);
    return this.svc.createRegisterRun(
      dto.assignmentId,
      dto.registerCode,
      dto.wagePeriodId ?? null,
      user.userId,
      dto.fileName ?? '',
      dto.fileUrl ?? '',
    );
  }

  @Post('register-runs/upload')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  @UseInterceptors(
    FileInterceptor(
      'file',
      makeSafeUploadOptions({ folder: 'clra-registers', maxMb: 10 }),
    ),
  )
  async uploadRegisterRun(
    @Body() dto: CreateClraRegisterRunDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: ReqUser,
  ) {
    assertSafeFileOnDisk(file);
    await this.scope.assertBodyRefs(user, dto);
    return this.svc.createRegisterRunFromUpload(dto, file, user.userId);
  }

  @Get('register-runs/:id/download')
  @Roles('ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT', 'CONTRACTOR')
  async downloadRegisterRun(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    if (user.roleCode === 'CONTRACTOR') {
      // A contractor may have the registers of their own assignments only.
      const contractor = await this.svc.findContractorForUser(
        user.userId,
        user.email,
      );
      const run = await this.svc.getRegisterRun(id);
      await this.svc.assertAssignmentBelongsToContractor(
        run.assignmentId,
        contractor.id,
      );
    } else {
      await this.scope.assertRegisterRun(user, id);
    }
    const out = await this.svc.downloadRegisterRun(id);
    res.setHeader('Content-Type', out.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${out.fileName}"`,
    );
    res.end(out.buffer);
  }
}
