import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CcoControlsService } from './cco-controls.service';
import {
  SaveSlaRuleDto,
  SaveEscalationThresholdDto,
  SaveReminderRuleDto,
  ToggleActiveDto,
} from './dto/cco-controls.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('CCO')
@ApiBearerAuth('JWT')
@Controller({ path: 'cco/controls', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class CcoControlsController {
  constructor(private readonly svc: CcoControlsService) {}

  @ApiOperation({ summary: 'Get All' })
  @Get()
  @Roles('CCO', 'ADMIN')
  getAll() {
    return this.svc.getAll();
  }

  // ── SLA Rules ──

  @ApiOperation({ summary: 'Save Sla' })
  @Post('sla')
  @Roles('CCO')
  saveSla(@Body() dto: SaveSlaRuleDto) {
    return this.svc.saveSla(dto);
  }

  @ApiOperation({ summary: 'Toggle Sla' })
  @Patch('sla/:id')
  @Roles('CCO')
  toggleSla(@Param('id') id: string, @Body() dto: ToggleActiveDto) {
    return this.svc.toggleSla(id, dto.isActive);
  }

  // ── Escalation Thresholds ──

  @ApiOperation({ summary: 'Save Threshold' })
  @Post('thresholds')
  @Roles('CCO')
  saveThreshold(@Body() dto: SaveEscalationThresholdDto) {
    return this.svc.saveThreshold(dto);
  }

  @ApiOperation({ summary: 'Toggle Threshold' })
  @Patch('thresholds/:id')
  @Roles('CCO')
  toggleThreshold(@Param('id') id: string, @Body() dto: ToggleActiveDto) {
    return this.svc.toggleThreshold(id, dto.isActive);
  }

  // ── Reminder Rules ──

  @ApiOperation({ summary: 'Save Reminder' })
  @Post('reminders')
  @Roles('CCO')
  saveReminder(@Body() dto: SaveReminderRuleDto) {
    return this.svc.saveReminder(dto);
  }

  @ApiOperation({ summary: 'Toggle Reminder' })
  @Patch('reminders/:id')
  @Roles('CCO')
  toggleReminder(@Param('id') id: string, @Body() dto: ToggleActiveDto) {
    return this.svc.toggleReminder(id, dto.isActive);
  }
}
