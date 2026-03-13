import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { ScopedListQueryDto } from '../common/dto/scoped-list-query.dto';
import { TaskListService } from '../list-queries/task-list.service';
import { ReturnListService } from '../list-queries/return-list.service';
import { ThreadListService } from '../list-queries/thread-list.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

/**
 * Standardised list endpoints for BranchDesk portal.
 * Branch is token-locked (single branch).
 */
@ApiTags('Branches')
@ApiBearerAuth('JWT')
@Controller({ path: 'branch', version: '1' })
@Roles('BRANCH_DESK', 'CLIENT')
export class BranchListController {
  constructor(
    private readonly tasks: TaskListService,
    private readonly returns: ReturnListService,
    private readonly threads: ThreadListService,
  ) {}

  /** Branch MCD items list */
  @ApiOperation({ summary: 'List Mcd' })
  @Get('mcd')
  listMcd(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.tasks.listMcdItems(user, q);
  }

  /** Branch Returns monthly list */
  @ApiOperation({ summary: 'List Returns' })
  @Get('returns')
  listReturns(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.returns.list(user, q);
  }

  /** Branch Returns yearly list (uses fy filter) */
  @ApiOperation({ summary: 'List Returns Yearly' })
  @Get('returns/yearly')
  listReturnsYearly(
    @CurrentUser() user: ReqUser,
    @Query() q: ScopedListQueryDto,
  ) {
    return this.returns.list(user, q);
  }

  /** Branch Queries (if branch has its own inbox) */
  @ApiOperation({ summary: 'List Queries' })
  @Get('queries')
  listQueries(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.threads.listThreads(user, q);
  }
}
