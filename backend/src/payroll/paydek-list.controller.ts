import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { ScopedListQueryDto } from '../common/dto/scoped-list-query.dto';
import { EmployeeListService } from '../list-queries/employee-list.service';
import { ThreadListService } from '../list-queries/thread-list.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

/**
 * Standardised list endpoints for PayDek (Payroll) portal.
 */
@ApiTags('Payroll')
@ApiBearerAuth('JWT')
@Controller({ path: 'paydek', version: '1' })
@Roles('PAYDEK', 'CRM', 'ADMIN')
export class PaydekListController {
  constructor(
    private readonly employees: EmployeeListService,
    private readonly threads: ThreadListService,
  ) {}

  /** Employees list */
  @ApiOperation({ summary: 'List Employees' })
  @Get('employees')
  listEmployees(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.employees.list(user, q);
  }

  /** PF/ESI pending employees drill-down */
  @ApiOperation({ summary: 'List Pf Esi Pending' })
  @Get('pf-esi/pending')
  listPfEsiPending(
    @CurrentUser() user: ReqUser,
    @Query() q: ScopedListQueryDto,
  ) {
    return this.employees.listPfEsiPending(user, q);
  }

  /** PayDek queries list */
  @ApiOperation({ summary: 'List Queries' })
  @Get('queries')
  listQueries(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.threads.listHelpdesk(user, q);
  }
}
