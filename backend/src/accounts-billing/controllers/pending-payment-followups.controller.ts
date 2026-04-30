import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { PendingPaymentFollowupsService } from '../services/pending-payment-followups.service';
import {
  CreatePendingPaymentFollowupDto,
  UpdatePendingPaymentFollowupDto,
} from '../dto/pending-payment-followup.dto';

@ApiTags('Billing - Pending Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTS')
@Controller('billing/pending-payments')
export class PendingPaymentFollowupsController {
  constructor(private readonly service: PendingPaymentFollowupsService) {}

  @ApiOperation({ summary: 'List pending-payment follow-ups' })
  @Get()
  list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      status,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }

  @ApiOperation({ summary: 'Download blank CSV template' })
  @Get('template.csv')
  template(@Res() res: Response) {
    const csv = this.service.buildCsvTemplate();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="pending-payments-template.csv"',
    );
    res.send(csv);
  }

  @ApiOperation({
    summary:
      'Upload CSV of pending invoices; if autoSend=1 send a reminder email per row immediately',
  })
  @ApiConsumes('multipart/form-data')
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('autoSend') autoSend: string | undefined,
    @Req() req: any,
  ) {
    const userId = req.user?.userId || req.user?.id || null;
    return this.service.uploadAndSend(file, userId, {
      autoSend: autoSend !== '0' && autoSend !== 'false',
    });
  }

  @ApiOperation({ summary: 'Create one pending-payment follow-up' })
  @Post()
  create(@Body() dto: CreatePendingPaymentFollowupDto, @Req() req: any) {
    const userId = req.user?.userId || req.user?.id || null;
    return this.service.create(dto, userId);
  }

  @ApiOperation({ summary: 'Update one pending-payment follow-up' })
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePendingPaymentFollowupDto,
  ) {
    return this.service.update(id, dto);
  }

  @ApiOperation({ summary: 'Send / re-send reminder email' })
  @Post(':id/send-reminder')
  sendReminder(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.sendReminder(id);
  }

  @ApiOperation({ summary: 'Send reminders to multiple selected entries' })
  @Post('send-reminders')
  sendBulk(@Body('ids') ids: string[]) {
    return this.service.sendBulk(ids || []);
  }

  @ApiOperation({ summary: 'Delete a pending-payment follow-up' })
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
