import {
  Controller, Get, Post, Patch, Param, Body, Query,
  ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { BillingClientsService } from '../services/billing-clients.service';
import { CreateBillingClientDto, UpdateBillingClientDto } from '../dto';

@ApiTags('Accounts & Billing - Clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTS')
@Controller({ path: 'billing/clients', version: '1' })
export class BillingClientsController {
  constructor(private readonly clientsService: BillingClientsService) {}

  @ApiOperation({ summary: 'Create a billing client' })
  @Post()
  async create(@Body() dto: CreateBillingClientDto) {
    return this.clientsService.create(dto, '00000000-0000-0000-0000-000000000000');
  }

  @ApiOperation({ summary: 'List billing clients' })
  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.clientsService.findAll({
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      search, status,
    });
  }

  @ApiOperation({ summary: 'Get active billing clients (for dropdowns)' })
  @Get('active')
  async findActive() {
    return this.clientsService.findActive();
  }

  @ApiOperation({ summary: 'Get billing client by ID' })
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.findOne(id);
  }

  @ApiOperation({ summary: 'Update billing client' })
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBillingClientDto,
  ) {
    return this.clientsService.update(id, dto);
  }
}
