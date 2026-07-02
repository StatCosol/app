import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SalesService } from './sales.service';
import {
  CreateLeadActivityDto,
  CreateLeadDto,
  ListLeadsQueryDto,
  UpdateLeadDto,
} from './dto/lead.dto';

@ApiTags('Sales')
@ApiBearerAuth('JWT')
@Controller({ path: 'sales/leads', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SALES', 'ADMIN', 'CEO')
export class SalesLeadsController {
  constructor(private readonly svc: SalesService) {}

  @Get()
  @ApiOperation({ summary: 'List leads (filterable)' })
  list(@CurrentUser() user: any, @Query() q: ListLeadsQueryDto) {
    return this.svc.list(user, q);
  }

  @Post()
  @ApiOperation({ summary: 'Create new lead' })
  create(@CurrentUser() user: any, @Body() dto: CreateLeadDto) {
    return this.svc.create(user, dto);
  }

  @Get('followups/mine')
  @ApiOperation({ summary: 'My overdue follow-ups (SALES user)' })
  myFollowups(@CurrentUser() user: any) {
    return this.svc.myFollowups(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lead by id' })
  findOne(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update lead' })
  update(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete lead (ADMIN/CEO only)' })
  async remove(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.svc.remove(user, id);
  }

  @Get(':id/activities')
  @ApiOperation({ summary: 'List lead activities' })
  listActivities(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.listActivities(user, id);
  }

  @Post(':id/activities')
  @ApiOperation({ summary: 'Log a lead activity (call/email/meeting/...)' })
  addActivity(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLeadActivityDto,
  ) {
    return this.svc.addActivity(user, id, dto);
  }
}

@ApiTags('CEO')
@ApiBearerAuth('JWT')
@Controller({ path: 'ceo', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CEO', 'ADMIN')
export class CeoSalesController {
  constructor(private readonly svc: SalesService) {}

  @Get('sales/summary')
  @ApiOperation({ summary: 'CEO sales pipeline summary' })
  pipeline() {
    return this.svc.ceoPipelineSummary();
  }

  @Get('sales/followups')
  @ApiOperation({ summary: 'CEO follow-ups view (overdue/awaiting/stale)' })
  followups() {
    return this.svc.ceoFollowups();
  }

  @Get('receivables/summary')
  @ApiOperation({ summary: 'CEO receivables / AR aging summary' })
  receivables() {
    return this.svc.ceoReceivables();
  }
}
