import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
type UploadedFileT = { originalname: string; buffer: Buffer; mimetype: string };

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ReturnsService } from './returns.service';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';
import { UploadProofDto } from './dto/upload-proof.dto';

const uploadOptions = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
};

@Controller({ path: 'crm/returns', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get('filings')
  list(@Req() req: any, @Query() q: any) {
    return this.returns.listForCrm(req.user, q);
  }

  @Get('types')
  types() {
    return this.returns.getReturnTypes();
  }

  @Patch('filings/:id/status')
  updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateReturnStatusDto,
  ) {
    return this.returns.updateStatusAsCrm(req.user, id, dto);
  }

  /** CRM can upload acknowledgement/challan proofs on behalf of branches */
  @Post('filings/:id/ack')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadAck(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileT,
    @Body() dto: UploadProofDto,
  ) {
    return this.returns.uploadProof(req.user, id, 'ack', file, dto?.ackNumber);
  }

  @Post('filings/:id/challan')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadChallan(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileT,
  ) {
    return this.returns.uploadProof(req.user, id, 'challan', file);
  }
}
