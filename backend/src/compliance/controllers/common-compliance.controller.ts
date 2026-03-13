import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ComplianceService } from '../compliance.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class CommonComplianceController {
  constructor(private readonly svc: ComplianceService) {}

  @ApiOperation({ summary: 'Get Master' })
  @Get('master')
  getMaster(@Req() req: any) {
    return this.svc.listComplianceMaster(req.user);
  }
}
