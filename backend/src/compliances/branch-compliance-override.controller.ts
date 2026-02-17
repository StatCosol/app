import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import {
  BranchComplianceOverrideService,
  OverrideMode,
} from './branch-compliance-override.service';
import { AccessPolicyService } from '../auth/policies/access-policy.service';

@Controller({ path: 'branch-compliances', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchComplianceOverrideController {
  constructor(
    private readonly svc: BranchComplianceOverrideService,
    private readonly policy: AccessPolicyService,
  ) {}

  @Roles('ADMIN', 'CCO', 'CRM')
  @Post('override')
  async override(
    @Body()
    body: {
      branchId: string;
      complianceId: string;
      mode: OverrideMode;
      reason?: string;
    },
    @CurrentUser() user: any,
  ) {
    if (user.roleCode === 'CRM') {
      await this.policy.assertBranchAccess(user, body.branchId);
    }

    return this.svc.setOverride({
      branchId: body.branchId,
      complianceId: body.complianceId,
      mode: body.mode,
      reason: body.reason,
      userId: user.id,
    });
  }
}
