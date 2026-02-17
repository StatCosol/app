import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
type UploadedFile = { originalname: string; buffer: Buffer; mimetype: string };
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { UploadProofDto } from './dto/upload-proof.dto';

const uploadOptions = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
};

@Controller({ path: 'client/returns', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get('filings')
  list(@Req() req: any, @Query() q: any) {
    return this.returns.listForClient(req.user, q);
  }

  @Get('types')
  types() {
    return this.returns.getReturnTypes();
  }

  @Post('filings')
  create(@Req() req: any, @Body() dto: CreateReturnDto) {
    return this.returns.createForClient(req.user, dto);
  }

  @Post('filings/:id/ack')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadAck(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file: UploadedFile,
    @Body() dto: UploadProofDto,
  ) {
    return this.returns.uploadProof(req.user, id, 'ack', file, dto?.ackNumber);
  }

  @Post('filings/:id/challan')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadChallan(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file: UploadedFile,
  ) {
    return this.returns.uploadProof(req.user, id, 'challan', file);
  }

  @Post('filings/:id/submit')
  submit(@Req() req: any, @Param('id') id: string) {
    return this.returns.submit(req.user, id);
  }
}
