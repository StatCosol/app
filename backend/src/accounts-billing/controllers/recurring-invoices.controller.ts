import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { RecurringInvoicesService } from '../services/recurring-invoices.service';
import {
  CreateRecurringInvoiceConfigDto,
  UpdateRecurringInvoiceConfigDto,
} from '../dto';
import { RecurringInvoiceCron } from '../jobs/recurring-invoice.cron';

@ApiTags('Accounts & Billing - Recurring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTS')
@Controller({ path: 'billing/recurring', version: '1' })
export class RecurringInvoicesController {
  constructor(
    private readonly service: RecurringInvoicesService,
    private readonly cron: RecurringInvoiceCron,
  ) {}

  @ApiOperation({ summary: 'List all recurring invoice configs' })
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @ApiOperation({ summary: 'Get one recurring config' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Create a recurring invoice config' })
  @Post()
  create(@Body() dto: CreateRecurringInvoiceConfigDto, @Req() req: any) {
    const userId =
      req.user?.userId || req.user?.id || '00000000-0000-0000-0000-000000000000';
    return this.service.create(dto, userId);
  }

  @ApiOperation({ summary: 'Update a recurring invoice config' })
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringInvoiceConfigDto,
  ) {
    return this.service.update(id, dto);
  }

  @ApiOperation({ summary: 'Activate or deactivate a recurring config' })
  @Patch(':id/toggle')
  toggle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.service.toggleActive(id, !!body.isActive);
  }

  @ApiOperation({ summary: 'Delete a recurring config' })
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @ApiOperation({
    summary: 'Manually trigger the monthly recurring invoice run (admin only)',
  })
  @Post('run-now')
  async runNow() {
    await this.cron.runMonthly();
    return { success: true };
  }
}
