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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

const uploadOptions = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
};

@ApiTags('Returns')
@ApiBearerAuth('JWT')
@Controller({ path: 'client/returns', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @ApiOperation({ summary: 'List' })
  @Get('filings')
  list(@CurrentUser() user: ReqUser, @Query() q: Record<string, string>) {
    return this.returns.listForClient(user, q);
  }

  @ApiOperation({ summary: 'Types' })
  @Get('types')
  types() {
    return this.returns.getReturnTypes();
  }

  @ApiOperation({ summary: 'Create' })
  @Post('filings')
  create(@CurrentUser() user: ReqUser, @Body() dto: CreateReturnDto) {
    return this.returns.createForClient(user, dto);
  }

  @ApiOperation({ summary: 'Upload Ack' })
  @Post('filings/:id/ack')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadAck(
    @Req() req: { body?: { ackNumber?: string } },
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @UploadedFile() file: UploadedFile,
  ) {
    const ackNumber =
      typeof req.body?.ackNumber === 'string'
        ? req.body.ackNumber.trim() || null
        : null;
    return this.returns.uploadProof(user, id, 'ack', file, ackNumber);
  }

  @ApiOperation({ summary: 'Upload Challan' })
  @Post('filings/:id/challan')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  uploadChallan(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @UploadedFile() file: UploadedFile,
  ) {
    return this.returns.uploadProof(user, id, 'challan', file);
  }

  @ApiOperation({ summary: 'Submit' })
  @Post('filings/:id/submit')
  submit(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.returns.submit(user, id);
  }
}
