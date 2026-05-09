import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PayrollService } from './payroll.service';
import { PayrollConfigAuditService } from './payroll-config-audit.service';
import { SaveComponentOverridesDto } from './dto/payroll-config.dto';
import { SaveClientPayslipLayoutDto } from './dto/save-client-payslip-layout.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';

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
  getEffectiveComponents(
    @CurrentUser() user: ReqUser,
    @Param('clientId') clientId: string,
  ) {
    return this.svc.getClientEffectiveComponents(user, clientId);
  }

  // Save overrides
  @ApiOperation({ summary: 'Save Overrides' })
  @Post(':clientId/component-overrides')
  saveOverrides(
    @CurrentUser() user: ReqUser,
    @Param('clientId') clientId: string,
    @Body() dto: SaveComponentOverridesDto,
  ) {
    return this.svc.saveClientComponentOverrides(user, clientId, dto);
  }

  // Payslip layout per client
  @ApiOperation({ summary: 'Get Layout' })
  @Get(':clientId/payslip-layout')
  getLayout(@CurrentUser() user: ReqUser, @Param('clientId') clientId: string) {
    return this.svc.getClientPayslipLayout(user, clientId);
  }

  @ApiOperation({ summary: 'Save Layout' })
  @Post(':clientId/payslip-layout')
  saveLayout(
    @CurrentUser() user: ReqUser,
    @Param('clientId') clientId: string,
    @Body() dto: SaveClientPayslipLayoutDto,
  ) {
    return this.svc.saveClientPayslipLayout(user, clientId, dto);
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
