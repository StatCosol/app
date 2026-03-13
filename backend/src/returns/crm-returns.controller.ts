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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

const uploadOptions = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
};

@ApiTags('Returns')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/returns', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  /**
   * Compatibility alias for older clients expecting:
   * GET /api/v1/crm/returns
   */
  @ApiOperation({ summary: 'List (Compatibility)' })
  @Get()
  listCompat(@Req() req: any, @Query() q: any) {
    return this.returns.listForCrm(req.user, q);
  }

  @ApiOperation({ summary: 'List' })
  @Get('filings')
  list(@Req() req: any, @Query() q: any) {
    return this.returns.listForCrm(req.user, q);
  }

  @ApiOperation({ summary: 'Types' })
  @Get('types')
  types() {
    return this.returns.getReturnTypes();
  }

  @ApiOperation({ summary: 'Update Status' })
  @Patch('filings/:id/status')
  updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateReturnStatusDto,
  ) {
    return this.returns.updateStatusAsCrm(req.user, id, dto);
  }

  /**
   * Compatibility aliases for older clients expecting:
   * GET /api/v1/crm/returns/:id
   * PATCH /api/v1/crm/returns/:id/status
   */
  @ApiOperation({ summary: 'Get (Compatibility)' })
  @Get(':id')
  getCompat(@Req() req: any, @Param('id') id: string) {
    return this.returns.getForCrm(req.user, id);
  }

  @ApiOperation({ summary: 'Update Status (Compatibility)' })
  @Patch(':id/status')
  updateStatusCompat(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateReturnStatusDto,
  ) {
    return this.returns.updateStatusAsCrm(req.user, id, dto);
  }

  /** CRM can upload acknowledgement/challan proofs on behalf of branches */
  @ApiOperation({ summary: 'Upload Ack' })
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

  @ApiOperation({ summary: 'Upload Challan' })
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
