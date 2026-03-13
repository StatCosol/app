import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PayrollService } from './payroll.service';
import { PayrollConfigAuditService } from './payroll-config-audit.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Payroll')
@ApiBearerAuth('JWT')
@Controller({ path: 'payroll/clients', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PAYROLL', 'ADMIN')
export class PayrollConfigController {
  constructor(
    private readonly svc: PayrollService,
    private readonly auditService: PayrollConfigAuditService,
  ) {}

  // Effective components = component master + per-client override
  @ApiOperation({ summary: 'Get Effective Components' })
  @Get(':clientId/components-effective')
  getEffectiveComponents(@Req() req: any, @Param('clientId') clientId: string) {
    return this.svc.getClientEffectiveComponents(req.user, clientId);
  }

  // Save overrides
  @ApiOperation({ summary: 'Save Overrides' })
  @Post(':clientId/component-overrides')
  saveOverrides(
    @Req() req: any,
    @Param('clientId') clientId: string,
    @Body() dto: any,
  ) {
    return this.svc.saveClientComponentOverrides(req.user, clientId, dto);
  }

  // Payslip layout per client
  @ApiOperation({ summary: 'Get Layout' })
  @Get(':clientId/payslip-layout')
  getLayout(@Req() req: any, @Param('clientId') clientId: string) {
    return this.svc.getClientPayslipLayout(req.user, clientId);
  }

  @ApiOperation({ summary: 'Save Layout' })
  @Post(':clientId/payslip-layout')
  saveLayout(
    @Req() req: any,
    @Param('clientId') clientId: string,
    @Body() dto: any,
  ) {
    return this.svc.saveClientPayslipLayout(req.user, clientId, dto);
  }

  @ApiOperation({ summary: 'Get Config Audit' })
  @Get(':clientId/config-audit')
  getConfigAudit(
    @Param('clientId') clientId: string,
    @Query('entityType') entityType?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.getHistory(clientId, {
      entityType,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
