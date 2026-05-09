import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ComplianceService } from '../compliance.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ReqUser } from '../../access/access-scope.service';

@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm/dashboard', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class ComplianceCrmDashboardController {
  constructor(private readonly svc: ComplianceService) {}

  @ApiOperation({ summary: 'Get' })
  @Get()
  get(@CurrentUser() user: ReqUser) {
    return this.svc.crmDashboard(user);
  }
}

// ✅ Avoid conflict with ContractorController GET /api/contractor/dashboard
@Controller({ path: 'contractor/dashboard', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ContractorDashboardController {
  constructor(private readonly svc: ComplianceService) {}

  @ApiOperation({ summary: 'Get' })
  @Get()
  get(@CurrentUser() user: ReqUser) {
    return this.svc.contractorDashboard(user);
  }
}

@Controller({ path: 'client/dashboard', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientDashboardController {
  constructor(private readonly svc: ComplianceService) {}

  @ApiOperation({ summary: 'Get' })
  @Get()
  get(@CurrentUser() user: ReqUser) {
    return this.svc.clientDashboard(user);
  }
}

@Controller({ path: 'admin/role-dashboard', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminRoleDashboardController {
  constructor(private readonly svc: ComplianceService) {}

  @ApiOperation({ summary: 'Get' })
  @Get()
  get(@CurrentUser() user: ReqUser) {
    return this.svc.adminDashboard(user);
  }
}

@Controller({ path: 'auditor/dashboard', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class ComplianceAuditorDashboardController {
  constructor(private readonly svc: ComplianceService) {}

  @ApiOperation({ summary: 'Get' })
  @Get()
  get(@CurrentUser() user: ReqUser) {
    return this.svc.auditorDashboard(user);
  }
}
