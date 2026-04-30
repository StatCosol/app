import { Controller, Get, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReqUser } from '../access/access-scope.service';

@ApiTags('Reports')
@ApiBearerAuth('JWT')
@Controller({ path: 'reports/compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComplianceReportController {
  constructor(private readonly ds: DataSource) {}

  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  @ApiOperation({ summary: 'Summary' })
  @Get()
  async summary(@CurrentUser() user: ReqUser) {
    const role = user?.roleCode;
    const params: unknown[] = [];
    let sql = 'SELECT * FROM vw_compliance_coverage';

    if (role === 'CRM') {
      sql +=
        ' WHERE "clientId" IN (SELECT client_id FROM client_assignments_current WHERE assignment_type = $1 AND assigned_to_user_id = $2)';
      params.push('CRM', user.id);
    }

    sql += ' ORDER BY "clientName", "branchName"';

    return this.ds.query(sql, params);
  }
}
