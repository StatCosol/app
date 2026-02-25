import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ComplianceService } from '../compliance.service';

@Controller({ path: 'crm/dashboard', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class ComplianceCrmDashboardController {
  constructor(private readonly svc: ComplianceService) {}

  @Get()
  get(@Req() req: any) {
    return this.svc.crmDashboard(req.user);
  }
}

// ✅ Avoid conflict with ContractorController GET /api/contractor/dashboard
@Controller({ path: 'contractor/dashboard', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ContractorDashboardController {
  constructor(private readonly svc: ComplianceService) {}

  @Get()
  get(@Req() req: any) {
    return this.svc.contractorDashboard(req.user);
  }
}

@Controller({ path: 'client/dashboard', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientDashboardController {
  constructor(private readonly svc: ComplianceService) {}

  @Get()
  get(@Req() req: any) {
    return this.svc.clientDashboard(req.user);
  }
}

@Controller({ path: 'admin/role-dashboard', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminRoleDashboardController {
  constructor(private readonly svc: ComplianceService) {}

  @Get()
  get(@Req() req: any) {
    return this.svc.adminDashboard(req.user);
  }
}

@Controller({ path: 'auditor/dashboard', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class ComplianceAuditorDashboardController {
  constructor(private readonly svc: ComplianceService) {}

  @Get()
  get(@Req() req: any) {
    return this.svc.auditorDashboard(req.user);
  }
}
