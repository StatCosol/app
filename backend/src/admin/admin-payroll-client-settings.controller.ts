import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PayrollClientSettings } from '../payroll/entities/payroll-client-settings.entity';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiTags('Admin')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin/payroll', version: '1' })
export class AdminPayrollClientSettingsController {
  constructor(
    @InjectRepository(PayrollClientSettings)
    private readonly settingsRepo: Repository<PayrollClientSettings>,
  ) {}

  // GET all payroll client settings from DB
  @ApiOperation({ summary: 'List Settings' })
  @Get(['client-settings', 'payroll-client-settings'])
  async listSettings() {
    const items = await this.settingsRepo.find();
    return { items };
  }

  @ApiOperation({ summary: 'Get Settings' })
  @Get(['client-settings/:clientId', 'payroll-client-settings/:clientId'])
  async getSettings(@Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.settingsRepo.findOne({ where: { clientId } });
  }

  @ApiOperation({ summary: 'Set Settings' })
  @Post(['client-settings/:clientId', 'payroll-client-settings/:clientId'])
  async setSettings(
    @Param('clientId', ParseUUIDPipe) clientId: string,
    @Body() dto: { settings: any; updated_by?: string },
  ) {
    let settings = await this.settingsRepo.findOne({ where: { clientId } });

    if (!settings) {
      settings = this.settingsRepo.create({
        clientId,
        settings: dto.settings,
        updatedBy: dto.updated_by ?? null,
      });
    } else {
      settings.settings = dto.settings;
      settings.updatedBy = dto.updated_by ?? null;
    }

    return this.settingsRepo.save(settings);
  }
}
