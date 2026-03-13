import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { BranchComplianceService } from '../branch-compliance.service';
import { ChecklistQueryDto } from '../dto/branch-compliance.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Branch Compliance')
@ApiBearerAuth('JWT')
@Controller({ path: 'auditor/compliance-docs', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class AuditorComplianceDocsController {
  constructor(private readonly svc: BranchComplianceService) {}

  /** Auditor: read-only view of compliance docs */
  @ApiOperation({ summary: 'List' })
  @Get()
  list(@Req() req: any, @Query() q: ChecklistQueryDto) {
    return this.svc.listForAuditor(req.user, q);
  }

  /** Return master list */
  @ApiOperation({ summary: 'Return Master' })
  @Get('return-master')
  returnMaster(@Query() q: any) {
    return this.svc.getReturnMaster(q);
  }
}
