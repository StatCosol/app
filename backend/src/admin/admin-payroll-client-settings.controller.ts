import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Roles } from '../auth/roles.decorator';
import { PayrollClientSettings } from '../payroll/entities/payroll-client-settings.entity';

@Roles('ADMIN')
@Controller('api/admin/payroll-client-settings')
export class AdminPayrollClientSettingsController {
  constructor(
    @InjectRepository(PayrollClientSettings)
    private readonly settingsRepo: Repository<PayrollClientSettings>,
  ) {}

  @Get(':clientId')
  async getSettings(@Param('clientId') clientId: string) {
    return this.settingsRepo.findOne({ where: { clientId } });
  }

  @Post(':clientId')
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
