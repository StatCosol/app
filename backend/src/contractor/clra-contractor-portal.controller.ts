import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
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
import {
  CreateClraWorkerDto,
  CreateClraDeploymentDto,
  CreateClraWagePeriodDto,
  UpsertClraAttendanceDto,
  UpsertClraWageDto,
  CreateClraRegisterRunDto,
} from './clra-assignments.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTRACTOR')
@Controller('clra/me')
export class ClraContractorPortalController {
  constructor(private readonly svc: ClraAssignmentsService) {}

  private async contractor(user: ReqUser) {
    return this.svc.findContractorForUser(user.userId, user.email);
  }

  @Get('contractor')
  getContractor(@CurrentUser() user: ReqUser) {
    return this.contractor(user);
  }

  @Get('assignments')
  async listAssignments(@CurrentUser() user: ReqUser) {
    const c = await this.contractor(user);
    return this.svc.listAssignments(c.id);
  }

  @Get('assignments/:id')
  async getAssignment(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const c = await this.contractor(user);
    return this.svc.assertAssignmentBelongsToContractor(id, c.id);
  }

  @Get('workers')
  async listWorkers(@CurrentUser() user: ReqUser) {
    const c = await this.contractor(user);
    return this.svc.listWorkers(c.id);
  }

  @Post('workers')
  async createWorker(
    @CurrentUser() user: ReqUser,
    @Body() dto: Omit<CreateClraWorkerDto, 'contractorId'>,
  ) {
    const c = await this.contractor(user);
    return this.svc.createWorker({ ...dto, contractorId: c.id });
  }

  @Put('workers/:id')
  async updateWorker(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateClraWorkerDto>,
  ) {
    const c = await this.contractor(user);
    await this.svc.assertWorkerBelongsToContractor(id, c.id);
    const { contractorId: _ignored, ...rest } = dto;
    return this.svc.updateWorker(id, rest);
  }

  @Get('assignments/:assignmentId/deployments')
  async listDeployments(
    @CurrentUser() user: ReqUser,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    const c = await this.contractor(user);
    await this.svc.assertAssignmentBelongsToContractor(assignmentId, c.id);
    return this.svc.listDeployments(assignmentId);
  }

  @Post('deployments')
  async createDeployment(
    @CurrentUser() user: ReqUser,
    @Body() dto: CreateClraDeploymentDto,
  ) {
    const c = await this.contractor(user);
    await this.svc.assertAssignmentBelongsToContractor(dto.assignmentId, c.id);
    await this.svc.assertWorkerBelongsToContractor(dto.workerId, c.id);
    return this.svc.createDeployment(dto);
  }

  @Put('deployments/:id')
  async updateDeployment(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateClraDeploymentDto>,
  ) {
    const c = await this.contractor(user);
    await this.svc.assertDeploymentBelongsToContractor(id, c.id);
    return this.svc.updateDeployment(id, dto);
  }

  @Get('assignments/:assignmentId/wage-periods')
  async listWagePeriods(
    @CurrentUser() user: ReqUser,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    const c = await this.contractor(user);
    await this.svc.assertAssignmentBelongsToContractor(assignmentId, c.id);
    return this.svc.listWagePeriods(assignmentId);
  }

  @Post('wage-periods')
  async createWagePeriod(
    @CurrentUser() user: ReqUser,
    @Body() dto: CreateClraWagePeriodDto,
  ) {
    const c = await this.contractor(user);
    await this.svc.assertAssignmentBelongsToContractor(dto.assignmentId, c.id);
    return this.svc.createWagePeriod(dto);
  }

  @Put('wage-periods/:id/close')
  async closeWagePeriod(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const c = await this.contractor(user);
    await this.svc.assertWagePeriodBelongsToContractor(id, c.id);
    return this.svc.closeWagePeriod(id);
  }

  @Get('wage-periods/:wagePeriodId/attendance')
  async listAttendance(
    @CurrentUser() user: ReqUser,
    @Param('wagePeriodId', ParseUUIDPipe) wagePeriodId: string,
  ) {
    const c = await this.contractor(user);
    await this.svc.assertWagePeriodBelongsToContractor(wagePeriodId, c.id);
    return this.svc.listAttendance(wagePeriodId);
  }

  @Post('attendance')
  async upsertAttendance(
    @CurrentUser() user: ReqUser,
    @Body() dto: UpsertClraAttendanceDto,
  ) {
    const c = await this.contractor(user);
    await this.svc.assertWagePeriodBelongsToContractor(dto.wagePeriodId, c.id);
    await this.svc.assertDeploymentBelongsToContractor(dto.workerDeploymentId, c.id);
    return this.svc.upsertAttendance(dto);
  }

  @Get('wage-periods/:wagePeriodId/wages')
  async listWages(
    @CurrentUser() user: ReqUser,
    @Param('wagePeriodId', ParseUUIDPipe) wagePeriodId: string,
  ) {
    const c = await this.contractor(user);
    await this.svc.assertWagePeriodBelongsToContractor(wagePeriodId, c.id);
    return this.svc.listWages(wagePeriodId);
  }

  @Post('wages')
  async upsertWage(
    @CurrentUser() user: ReqUser,
    @Body() dto: UpsertClraWageDto,
  ) {
    const c = await this.contractor(user);
    await this.svc.assertWagePeriodBelongsToContractor(dto.wagePeriodId, c.id);
    await this.svc.assertDeploymentBelongsToContractor(dto.workerDeploymentId, c.id);
    return this.svc.upsertWage(dto);
  }

  @Get('assignments/:assignmentId/register-runs')
  async listRegisterRuns(
    @CurrentUser() user: ReqUser,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    const c = await this.contractor(user);
    await this.svc.assertAssignmentBelongsToContractor(assignmentId, c.id);
    return this.svc.listRegisterRuns(assignmentId);
  }

  @Post('register-runs')
  async createRegisterRun(
    @CurrentUser() user: ReqUser,
    @Body() dto: CreateClraRegisterRunDto,
  ) {
    const c = await this.contractor(user);
    await this.svc.assertAssignmentBelongsToContractor(dto.assignmentId, c.id);
    if (dto.wagePeriodId) {
      await this.svc.assertWagePeriodBelongsToContractor(dto.wagePeriodId, c.id);
    }
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
  @UseInterceptors(
    FileInterceptor('file', makeSafeUploadOptions({ folder: 'clra-registers', maxMb: 10 })),
  )
  async uploadRegisterRun(
    @CurrentUser() user: ReqUser,
    @Body() dto: CreateClraRegisterRunDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const c = await this.contractor(user);
    await this.svc.assertAssignmentBelongsToContractor(dto.assignmentId, c.id);
    if (dto.wagePeriodId) {
      await this.svc.assertWagePeriodBelongsToContractor(dto.wagePeriodId, c.id);
    }
    assertSafeFileOnDisk(file);
    return this.svc.createRegisterRunFromUpload(dto, file, user.userId);
  }

  @Get('register-runs/:id/download')
  async downloadRegisterRun(
    @CurrentUser() user: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const c = await this.contractor(user);
    const row = await this.svc.getRegisterRun(id);
    await this.svc.assertAssignmentBelongsToContractor(row.assignmentId, c.id);
    const out = await this.svc.downloadRegisterRun(id);
    res.setHeader('Content-Type', out.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${out.fileName}"`);
    res.end(out.buffer);
  }
}
