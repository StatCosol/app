import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditsService } from './audits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateAuditDto } from './dto/create-audit.dto';
import { BranchAccessService } from '../auth/branch-access.service';

@Controller({ path: 'crm/audits', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CRM')
export class CrmAuditsController {
  constructor(private readonly svc: AuditsService) {}

  @Post()
  create(@Req() req: any, @Body() dto: CreateAuditDto) {
    return this.svc.createForCrm(req.user, dto);
  }
}

@Controller({ path: 'auditor/audits', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AUDITOR')
export class AuditorAuditsController {
  constructor(private readonly svc: AuditsService) {}

  @Get()
  list(@Req() req: any, @Query() q: any) {
    return this.svc.listForAuditor(req.user, q);
  }

  @Get(':id')
  getOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getForAuditor(req.user, id);
  }
}

@Controller({ path: 'client/audits', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
export class ClientAuditsController {
  constructor(
    private readonly svc: AuditsService,
    private readonly branchAccess: BranchAccessService,
    private readonly ds: DataSource,
  ) {}

  @Get()
  async list(@Req() req: any, @Query() q: any) {
    const rows = await this.svc.listForClient(req.user, q);
    // Branch-scope: filter audits to contractors mapped to user's branches
    const branchIds = await this.branchAccess.getUserBranchIds(req.user.userId);
    if (branchIds.length > 0 && rows.length > 0) {
      // Get contractor IDs mapped to user's branches
      // NOTE: DB table name is `branch_contractor` (singular) as per schema.
      const mapped: { contractor_user_id: string }[] = await this.ds.query(
        `SELECT DISTINCT contractor_user_id FROM branch_contractor WHERE branch_id = ANY($1)`,
        [branchIds],
      );
      const allowedContractors = new Set(
        mapped.map((r) => r.contractor_user_id),
      );
      return rows.filter((a: any) => {
        if (!a.contractorUserId) return true; // non-contractor audits visible to all
        return allowedContractors.has(a.contractorUserId);
      });
    }
    return rows;
  }

  @Get('summary')
  summary(@Req() req: any) {
    return this.svc.getSummaryForClient(req.user);
  }
}
