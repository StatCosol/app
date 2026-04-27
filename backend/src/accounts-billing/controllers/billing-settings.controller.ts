import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { BillingSettingsService } from '../services/billing-settings.service';
import { UpdateBillingSettingsDto } from '../dto';

@ApiTags('Accounts & Billing - Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTS')
@Controller({ path: 'billing/settings', version: '1' })
export class BillingSettingsController {
  constructor(private readonly settingsService: BillingSettingsService) {}

  @ApiOperation({ summary: 'Get billing settings' })
  @Get()
  async getSettings() {
    return this.settingsService.getSettings();
  }

  @ApiOperation({ summary: 'Update billing settings' })
  @Patch()
  async updateSettings(@Body() dto: UpdateBillingSettingsDto) {
    return this.settingsService.updateSettings(dto);
  }
}
