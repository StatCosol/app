import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ContractorDocumentsService } from './contractor-documents.service';
import type {
  ContractorDocumentCreateDto,
  ContractorDocumentReuploadDto,
} from './contractor-documents.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { makeSafeUploadOptions, assertSafeFile } from '../common/safe-upload';

const fileUploadOptions = makeSafeUploadOptions({
  folder: 'contractor-documents',
  maxMb: 10,
  allowedMimes: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
});

@ApiTags('Contractor')
@ApiBearerAuth('JWT')
@Controller({ path: 'contractor/documents', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ContractorDocumentsController {
  constructor(private readonly svc: ContractorDocumentsService) {}

  @ApiOperation({ summary: 'List' })
  @Get()
  list(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.svc.contractorList(user, q);
  }

  @ApiOperation({ summary: 'Upload' })
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  upload(
    @CurrentUser() user: ReqUser,
    @Body() dto: ContractorDocumentCreateDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    assertSafeFile(file);
    return this.svc.contractorUpload(user, dto, file);
  }

  @ApiOperation({ summary: 'Reupload' })
  @Post('reupload/:id')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  reupload(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() dto: ContractorDocumentReuploadDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    assertSafeFile(file);
    return this.svc.contractorReupload(user, id, dto, file);
  }
}
