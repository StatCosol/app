import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PayrollService } from './payroll.service';

@Controller('api/payroll/clients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PAYROLL', 'ADMIN')
export class PayrollConfigController {
  constructor(private readonly svc: PayrollService) {}

  // Effective components = component master + per-client override
  @Get(':clientId/components-effective')
  getEffectiveComponents(@Req() req: any, @Param('clientId') clientId: string) {
    return this.svc.getClientEffectiveComponents(req.user, clientId);
  }

  // Save overrides
  @Post(':clientId/component-overrides')
  saveOverrides(@Req() req: any, @Param('clientId') clientId: string, @Body() dto: any) {
    return this.svc.saveClientComponentOverrides(req.user, clientId, dto);
  }

  // Payslip layout per client
  @Get(':clientId/payslip-layout')
  getLayout(@Req() req: any, @Param('clientId') clientId: string) {
    return this.svc.getClientPayslipLayout(req.user, clientId);
  }

  @Post(':clientId/payslip-layout')
  saveLayout(@Req() req: any, @Param('clientId') clientId: string, @Body() dto: any) {
    return this.svc.saveClientPayslipLayout(req.user, clientId, dto);
  }
}
