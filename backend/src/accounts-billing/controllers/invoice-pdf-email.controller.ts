import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { InvoicePdfService } from '../services/invoice-pdf.service';
import { InvoiceEmailService } from '../services/invoice-email.service';
import { SendInvoiceEmailDto } from '../dto';

@ApiTags('Accounts & Billing - PDF & Email')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTS')
@Controller({ path: 'billing', version: '1' })
export class InvoicePdfEmailController {
  constructor(
    private readonly pdfService: InvoicePdfService,
    private readonly emailService: InvoiceEmailService,
  ) {}

  @ApiOperation({ summary: 'Generate invoice PDF (returns PDF binary)' })
  @Post('invoices/:id/generate-pdf')
  async generatePdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, fileName } = await this.pdfService.generatePdfBuffer(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.end(buffer);
  }

  @ApiOperation({ summary: 'Download invoice PDF (regenerates if missing)' })
  @Get('invoices/:id/pdf')
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, fileName } = await this.pdfService.generatePdfBuffer(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    res.end(buffer);
  }

  @ApiOperation({ summary: 'Send invoice via email' })
  @Post('invoices/:id/send-email')
  async sendEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendInvoiceEmailDto,
    @CurrentUser() user: any,
  ) {
    return this.emailService.sendInvoice(id, dto, user?.userId ?? user?.id);
  }

  @ApiOperation({ summary: 'Email logs' })
  @Get('email-logs')
  async emailLogs(
    @Query('invoiceId') invoiceId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.emailService.findLogs({
      invoiceId,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }
}
