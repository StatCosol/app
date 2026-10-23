import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
import { makeSafeUploadOptions } from '../common/safe-upload';
import { AuditFieldworkService } from './audit-fieldwork.service';
import {
  AddFieldworkItemDto,
  ReviewFieldworkDto,
  UploadFieldworkEvidenceDto,
} from './dto/audit-fieldwork.dto';
@Controller({ path: 'audit-fieldwork', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT', 'AUDITOR')
export class AuditFieldworkController {
  constructor(private readonly svc: AuditFieldworkService) {}
  @Get(':id') workspace(
    @CurrentUser() u: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.workspace(u, id);
  }
  @Post(':id/items') @Roles('AUDITOR') add(
    @CurrentUser() u: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: AddFieldworkItemDto,
  ) {
    return this.svc.add(u, id, b);
  }
  @Post(':id/items/:itemId/evidence')
  @UseInterceptors(
    FileInterceptor('file', makeSafeUploadOptions({ memory: true, maxMb: 10 })),
  )
  upload(
    @CurrentUser() u: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) item: string,
    @Body() b: UploadFieldworkEvidenceDto,
    @UploadedFile() f: Express.Multer.File,
  ) {
    return this.svc.upload(u, id, item, b, f);
  }
  @Post(':id/items/:itemId/review') @Roles('AUDITOR') review(
    @CurrentUser() u: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) item: string,
    @Body() b: ReviewFieldworkDto,
  ) {
    return this.svc.review(u, id, item, b);
  }
  @Get(':id/evidence/:evidenceId/file')
  async file(
    @CurrentUser() u: ReqUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('evidenceId', ParseUUIDPipe) evidence: string,
    @Res() res: Response,
  ) {
    const f = await this.svc.file(u, id, evidence);
    res.setHeader('Cache-Control', 'private, no-store');
    res.download(f.path, f.name);
  }
}
