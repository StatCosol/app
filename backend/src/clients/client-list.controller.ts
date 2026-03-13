import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { ScopedListQueryDto } from '../common/dto/scoped-list-query.dto';
import { TaskListService } from '../list-queries/task-list.service';
import { ReturnListService } from '../list-queries/return-list.service';
import { DocListService } from '../list-queries/doc-list.service';
import { ThreadListService } from '../list-queries/thread-list.service';
import { AuditListService } from '../list-queries/audit-list.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

/**
 * Standardised list endpoints for LegitX Client portal.
 * ClientId is locked from the JWT token.
 */
@ApiTags('Clients')
@ApiBearerAuth('JWT')
@Controller({ path: 'client', version: '1' })
@Roles('CLIENT')
export class ClientListController {
  constructor(
    private readonly tasks: TaskListService,
    private readonly returns: ReturnListService,
    private readonly docs: DocListService,
    private readonly threads: ThreadListService,
    private readonly audits: AuditListService,
  ) {}

  /** Client compliance branch-wise tasks */
  @ApiOperation({ summary: 'List Compliance' })
  @Get('compliance/branch-wise')
  listCompliance(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.tasks.listTasks(user, q);
  }

  /** Client Returns list (tabbed) */
  @ApiOperation({ summary: 'List Returns' })
  @Get('returns')
  listReturns(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.returns.list(user, q);
  }

  /** Client Audits list */
  @ApiOperation({ summary: 'List Audits' })
  @Get('audits')
  listAudits(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.audits.list(user, q);
  }

  /** Client Documents list */
  @ApiOperation({ summary: 'List Documents' })
  @Get('documents')
  listDocuments(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.docs.listComplianceDocs(user, q);
  }

  /** Client Queries list (threads) */
  @ApiOperation({ summary: 'List Queries' })
  @Get('queries')
  listQueries(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.threads.listThreads(user, q);
  }
}
