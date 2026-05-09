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
@Controller({ path: 'branch/compliance-docs', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'BRANCH')
export class BranchReuploadController {
  constructor(private readonly svc: ComplianceService) {}

  @ApiOperation({ summary: 'List Reupload Requests' })
  @Get('reupload-requests')
  listReuploadRequests(
    @CurrentUser() user: ReqUser,
    @Query() q: Record<string, string>,
  ) {
    return this.svc.branchListReuploadRequests(user, q);
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
    return this.svc.branchReuploadFile(user, requestId, file);
  }

  @ApiOperation({ summary: 'Submit Reupload' })
  @Post('reupload-requests/:id/submit')
  submitReupload(@CurrentUser() user: ReqUser, @Param('id') requestId: string) {
    return this.svc.branchSubmitReupload(user, requestId);
  }

  @ApiOperation({ summary: 'Mark Reupload as Not Applicable' })
  @Post('reupload-requests/:id/mark-not-applicable')
  markNotApplicable(
    @CurrentUser() user: ReqUser,
    @Param('id') requestId: string,
    @Body() dto: { remarks: string },
  ) {
    return this.svc.branchMarkReuploadNotApplicable(
      user,
      requestId,
      dto.remarks,
    );
  }
}
