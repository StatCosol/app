import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ComplianceService } from '../compliance.service';

@Controller('api/crm/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmDashboardController {
  constructor(private readonly svc: ComplianceService) {}

  @Get()
  get(@Req() req: any) {
    return this.svc.crmDashboard(req.user);
  }
}

// ✅ Avoid conflict with ContractorController GET /api/contractor/dashboard
@Controller('api/contractor/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CONTRACTOR')
export class ContractorDashboardController {
  constructor(private readonly svc: ComplianceService) {}

  @Get()
  get(@Req() req: any) {
    return this.svc.contractorDashboard(req.user);
  }
}

@Controller('api/client/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientDashboardController {
  constructor(private readonly svc: ComplianceService) {}

  @Get()
  get(@Req() req: any) {
    return this.svc.clientDashboard(req.user);
  }
}

@Controller('api/admin/role-dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminRoleDashboardController {
  constructor(private readonly svc: ComplianceService) {}

  @Get()
  get(@Req() req: any) {
    return this.svc.adminDashboard(req.user);
  }
}

@Controller('api/auditor/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class AuditorDashboardController {
  constructor(private readonly svc: ComplianceService) {}

  @Get()
  get(@Req() req: any) {
    return this.svc.auditorDashboard(req.user);
  }
}
