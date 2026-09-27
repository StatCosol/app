import { Controller, Get, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReqUser } from '../access/access-scope.service';
import { OperationalScopeService } from '../access/operational-scope.service';

@ApiTags('Reports')
@ApiBearerAuth('JWT')
@Controller({ path: 'reports/compliance', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComplianceReportController {
  constructor(
    private readonly ds: DataSource,
    private readonly scope: OperationalScopeService,
  ) {}

  @Roles('ADMIN', 'CEO', 'CCO', 'CRM')
  @ApiOperation({ summary: 'Summary' })
  @Get()
  async summary(@CurrentUser() user: ReqUser) {
    const scope = await this.scope.resolve(user);
    const params: unknown[] = [];
    let sql = 'SELECT * FROM vw_compliance_coverage';

    if (scope.level === 'clients') {
      sql += ' WHERE "clientId" = ANY($1::uuid[])';
      params.push(scope.clientIds ?? []);
    }

    sql += ' ORDER BY "clientName", "branchName"';

    return this.ds.query(sql, params);
  }
}
