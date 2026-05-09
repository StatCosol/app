import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { InvoicePaymentsService } from '../services/invoice-payments.service';
import { RecordPaymentDto } from '../dto';

@ApiTags('Accounts & Billing - Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTS')
@Controller({ path: 'billing', version: '1' })
export class InvoicePaymentsController {
  constructor(private readonly paymentsService: InvoicePaymentsService) {}

  @ApiOperation({ summary: 'Record a payment against an invoice' })
  @Post('invoices/:id/payments')
  async recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: any,
  ) {
    return this.paymentsService.recordPayment(
      id,
      dto,
      user?.userId ?? user?.id,
    );
  }

  @ApiOperation({ summary: 'Get payments for an invoice' })
  @Get('invoices/:id/payments')
  async findByInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.findByInvoice(id);
  }

  @ApiOperation({ summary: 'List all payments' })
  @Get('payments')
  async findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.paymentsService.findAll({
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }
}
