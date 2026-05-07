import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ComplianceService } from '../compliance.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';
import {
  makeSafeUploadOptions,
  assertSafeFile,
} from '../../common/safe-upload';

const fileUploadOptions = makeSafeUploadOptions({
  folder: 'compliance',
  maxMb: 10,
  allowedMimes: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
});

@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'contractor/compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ContractorComplianceController {
  constructor(private readonly svc: ComplianceService) {}

  @ApiOperation({ summary: 'List' })
  @Get('tasks')
  list(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.svc.contractorListTasks(user, q);
  }

  @ApiOperation({ summary: 'Detail' })
  @Get('tasks/:id')
  detail(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.contractorGetTaskDetail(user, id);
  }

  @ApiOperation({ summary: 'Start' })
  @Post('tasks/:id/start')
  start(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.contractorSetInProgress(user, id);
  }

  @ApiOperation({ summary: 'Submit' })
  @Post('tasks/:id/submit')
  submit(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.svc.contractorSubmit(user, id);
  }

  @ApiOperation({ summary: 'Mark Not Applicable' })
  @Post('tasks/:id/mark-not-applicable')
  markNotApplicable(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: { remarks: string },
  ) {
    return this.svc.contractorMarkNotApplicable(user, id, dto.remarks);
  }

  @ApiOperation({ summary: 'Comment' })
  @Post('tasks/:id/comment')
  comment(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: { message: string },
  ) {
    return this.svc.contractorAddComment(user, id, dto.message);
  }

  @ApiOperation({ summary: 'Upload Evidence' })
  @Post('tasks/:id/evidence')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  uploadEvidence(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: { notes?: string },
  ) {
    assertSafeFile(file);
    return this.svc.contractorUploadEvidence(user, id, file, dto?.notes);
  }

  // Reupload workflow endpoints

  @ApiOperation({ summary: 'List Reupload Requests' })
  @Get('reupload-requests')
  listReuploadRequests(
    @CurrentUser() user: ReqUser,
    @Query() filters: Record<string, string>,
  ) {
    return this.svc.contractorListReuploadRequests(user, filters);
  }

  @ApiOperation({ summary: 'Get Doc Remarks' })
  @Get('docs/:docId/remarks')
  getDocRemarks(@CurrentUser() user: ReqUser, @Param('docId') docId: string) {
    return this.svc.contractorGetDocRemarks(user, docId);
  }

  @ApiOperation({ summary: 'Reupload File' })
  @Post('reupload-requests/:id/upload')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  reuploadFile(
    @CurrentUser() user: ReqUser,
    @Param('id') requestId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    assertSafeFile(file);
    return this.svc.contractorReuploadFile(user, requestId, file);
  }

  @ApiOperation({ summary: 'Submit Reupload' })
  @Post('reupload-requests/:id/submit')
  submitReupload(@CurrentUser() user: ReqUser, @Param('id') requestId: string) {
    return this.svc.contractorSubmitReupload(user, requestId);
  }
}
