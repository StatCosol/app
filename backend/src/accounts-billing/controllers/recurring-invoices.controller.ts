import {
  Body,
  ConflictException,
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
  // Idempotency: prevent concurrent / repeated run-now within a short window
  private static lastRunAt = 0;
  private static runInFlight = false;
  private static readonly RUN_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

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
    @Req() req: any,
  ) {
    const userId = req.user?.userId || req.user?.id;
    return this.service.update(id, dto, userId);
  }

  @ApiOperation({ summary: 'Activate or deactivate a recurring config' })
  @Patch(':id/toggle')
  toggle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { isActive: boolean },
    @Req() req: any,
  ) {
    const userId = req.user?.userId || req.user?.id;
    return this.service.toggleActive(id, !!body.isActive, userId);
  }

  @ApiOperation({ summary: 'Delete a recurring config' })
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const userId = req.user?.userId || req.user?.id;
    return this.service.remove(id, userId);
  }

  @ApiOperation({
    summary: 'Manually trigger the monthly recurring invoice run',
  })
  @Roles('ADMIN', 'ACCOUNTS')
  @Post('run-now')
  async runNow() {
    const now = Date.now();
    if (RecurringInvoicesController.runInFlight) {
      throw new ConflictException('A recurring run is already in progress');
    }
    if (now - RecurringInvoicesController.lastRunAt < RecurringInvoicesController.RUN_COOLDOWN_MS) {
      throw new ConflictException(
        'Recurring run was triggered recently; please wait before re-running',
      );
    }
    RecurringInvoicesController.runInFlight = true;
    try {
      const result = await this.cron.runMonthly();
      RecurringInvoicesController.lastRunAt = Date.now();
      return { success: true, ...result };
    } finally {
      RecurringInvoicesController.runInFlight = false;
    }
  }
}
