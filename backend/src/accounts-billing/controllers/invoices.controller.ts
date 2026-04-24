import {
  Controller, Get, Post, Patch, Param, Body, Query,
  ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { InvoicesService } from '../services/invoices.service';
import { CreateInvoiceDto } from '../dto';

@ApiTags('Accounts & Billing - Invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTS')
@Controller({ path: 'billing/invoices', version: '1' })
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @ApiOperation({ summary: 'Create a new invoice' })
  @Post()
  async create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: any) {
    return this.invoicesService.create(dto, user?.userId ?? user?.id);
  }

  @ApiOperation({ summary: 'List invoices with filters' })
  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('clientId') clientId?: string,
    @Query('search') search?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.invoicesService.findAll({
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      status, paymentStatus, clientId, search, fromDate, toDate,
    });
  }

  @ApiOperation({ summary: 'Dashboard statistics' })
  @Get('stats/dashboard')
  async dashboard() {
    return this.invoicesService.getDashboardStats();
  }

  @ApiOperation({ summary: 'GST summary report' })
  @Get('reports/gst-summary')
  async gstSummary(
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ) {
    return this.invoicesService.getGstSummary(fromDate, toDate);
  }

  @ApiOperation({ summary: 'Get invoice by ID' })
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.findOne(id);
  }

  @ApiOperation({ summary: 'Approve a draft invoice' })
  @Post(':id/approve')
  async approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.invoicesService.approve(id, user?.userId ?? user?.id);
  }

  @ApiOperation({ summary: 'Cancel an invoice' })
  @Post(':id/cancel')
  async cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.cancel(id);
  }
}
