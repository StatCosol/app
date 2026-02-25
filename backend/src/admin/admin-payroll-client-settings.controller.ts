import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PayrollClientSettings } from '../payroll/entities/payroll-client-settings.entity';

@Roles('ADMIN')
@UseGuards(RolesGuard)
@Controller({ path: 'admin/payroll', version: '1' })
export class AdminPayrollClientSettingsController {
  constructor(
    @InjectRepository(PayrollClientSettings)
    private readonly settingsRepo: Repository<PayrollClientSettings>,
  ) {}

  // GET all payroll client settings from DB
  @Get(['client-settings', 'payroll-client-settings'])
  async listSettings() {
    const items = await this.settingsRepo.find();
    return { items };
  }

  @Get(['client-settings/:clientId', 'payroll-client-settings/:clientId'])
  async getSettings(@Param('clientId') clientId: string) {
    return this.settingsRepo.findOne({ where: { clientId } });
  }

  @Post(['client-settings/:clientId', 'payroll-client-settings/:clientId'])
  async setSettings(
    @Param('clientId') clientId: string,
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
