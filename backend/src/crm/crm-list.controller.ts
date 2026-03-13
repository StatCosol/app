import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { ScopedListQueryDto } from '../common/dto/scoped-list-query.dto';
import { TaskListService } from '../list-queries/task-list.service';
import { ReturnListService } from '../list-queries/return-list.service';
import { DocListService } from '../list-queries/doc-list.service';
import { ThreadListService } from '../list-queries/thread-list.service';
import { ReturnsService } from '../returns/returns.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

/**
 * Standardised list endpoints for CRM portal.
 * All endpoints use ListQueryDto + scope enforcement.
 */
@ApiTags('CRM')
@ApiBearerAuth('JWT')
@Controller({ path: 'crm', version: '1' })
@Roles('CRM')
export class CrmListController {
  constructor(
    private readonly tasks: TaskListService,
    private readonly returns: ReturnListService,
    private readonly docs: DocListService,
    private readonly threads: ThreadListService,
    private readonly returnsWorkflow: ReturnsService,
  ) {}

  /** CRM Tasks list — paginated, searchable, sortable */
  @ApiOperation({ summary: 'List Tasks' })
  @Get('tasks')
  listTasks(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.tasks.listTasks(user, q);
  }

  /** CRM Due-items (Returns / Renewals / Amendments) — use category filter */
  @ApiOperation({ summary: 'List Due Items' })
  @Get('due-items')
  listDueItems(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.returns.list(user, q);
  }

  /** CRM Due-items KPI cards */
  @ApiOperation({ summary: 'Due Item Kpis' })
  @Get('due-items/kpis')
  dueItemsKpis(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.returns.kpis(user, q);
  }

  /** CRM Renewals list alias */
  @ApiOperation({ summary: 'List Renewals' })
  @Get('renewals')
  listRenewals(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.returns.list(user, {
      ...q,
      category: 'RENEWAL',
    } as ScopedListQueryDto);
  }

  /** CRM Renewals KPI alias */
  @ApiOperation({ summary: 'Renewal Kpis' })
  @Get('renewals/kpis')
  renewalsKpis(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.returns.kpis(user, {
      ...q,
      category: 'RENEWAL',
    } as ScopedListQueryDto);
  }

  /** CRM Renewal detail alias */
  @ApiOperation({ summary: 'Get Renewal' })
  @Get('renewals/:id')
  getRenewal(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.returnsWorkflow.getForCrm(user, id);
  }

  /** CRM Renewal status update alias */
  @ApiOperation({ summary: 'Update Renewal Status' })
  @Put('renewals/:id/status')
  updateRenewalStatus(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body?: { status?: string; reason?: string },
  ) {
    return this.returnsWorkflow.updateStatusAsCrm(user, id, {
      status: (body?.status as any) || 'IN_PROGRESS',
      reason: body?.reason || null,
    });
  }

  /** CRM Renewal owner assignment alias */
  @ApiOperation({ summary: 'Assign Renewal Owner' })
  @Post('renewals/:id/assign')
  assignRenewalOwner(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body?: { owner?: string; message?: string },
  ) {
    return this.returnsWorkflow.requestUpdateAsCrm(
      user,
      id,
      'OWNER',
      body?.message || null,
      body?.owner || null,
    );
  }

  /** CRM Renewal reminder alias */
  @ApiOperation({ summary: 'Send Renewal Reminder' })
  @Post('renewals/:id/reminder')
  sendRenewalReminder(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body?: { message?: string },
  ) {
    return this.returnsWorkflow.requestUpdateAsCrm(
      user,
      id,
      'REMINDER',
      body?.message || null,
      null,
    );
  }

  /** CRM Amendments list alias */
  @ApiOperation({ summary: 'List Amendments' })
  @Get('amendments')
  listAmendments(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.returns.list(user, {
      ...q,
      category: 'AMENDMENT',
    } as ScopedListQueryDto);
  }

  /** CRM Amendments KPI alias */
  @ApiOperation({ summary: 'Amendment Kpis' })
  @Get('amendments/kpis')
  amendmentsKpis(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.returns.kpis(user, {
      ...q,
      category: 'AMENDMENT',
    } as ScopedListQueryDto);
  }

  /** CRM Amendment detail alias */
  @ApiOperation({ summary: 'Get Amendment' })
  @Get('amendments/:id')
  getAmendment(@CurrentUser() user: ReqUser, @Param('id') id: string) {
    return this.returnsWorkflow.getForCrm(user, id);
  }

  /** CRM Amendment status update alias */
  @ApiOperation({ summary: 'Update Amendment Status' })
  @Put('amendments/:id/status')
  updateAmendmentStatus(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body?: { status?: string; reason?: string },
  ) {
    return this.returnsWorkflow.updateStatusAsCrm(user, id, {
      status: (body?.status as any) || 'IN_PROGRESS',
      reason: body?.reason || null,
    });
  }

  /** CRM Amendment comment alias */
  @ApiOperation({ summary: 'Add Amendment Comment' })
  @Post('amendments/:id/comments')
  addAmendmentComment(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body?: { message?: string },
  ) {
    return this.returnsWorkflow.requestUpdateAsCrm(
      user,
      id,
      'NOTE',
      body?.message || null,
      null,
    );
  }

  /** CRM approve due item */
  @ApiOperation({ summary: 'Approve Due Item' })
  @Post('due-items/:id/approve')
  approveDueItem(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body?: { remarks?: string },
  ) {
    return this.returnsWorkflow.updateStatusAsCrm(user, id, {
      status: 'APPROVED',
      reason: body?.remarks || null,
    });
  }

  /** CRM reject due item */
  @ApiOperation({ summary: 'Reject Due Item' })
  @Post('due-items/:id/reject')
  rejectDueItem(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body() body?: { remarks?: string },
  ) {
    return this.returnsWorkflow.updateStatusAsCrm(user, id, {
      status: 'REJECTED',
      reason: body?.remarks || null,
    });
  }

  /** CRM request update from branch */
  @ApiOperation({ summary: 'Request Update' })
  @Post('due-items/:id/request')
  requestDueItemUpdate(
    @CurrentUser() user: ReqUser,
    @Param('id') id: string,
    @Body()
    body?: {
      message?: string;
      action?: 'RETURN' | 'REMINDER' | 'OWNER' | 'NOTE';
      owner?: string;
    },
  ) {
    return this.returnsWorkflow.requestUpdateAsCrm(
      user,
      id,
      body?.action || 'RETURN',
      body?.message || null,
      body?.owner || null,
    );
  }

  /** CRM Document review queue */
  @ApiOperation({ summary: 'List Doc Review' })
  @Get('documents/review')
  listDocReview(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.docs.listComplianceDocs(user, q);
  }

  /** CRM MCD items for a branch */
  @ApiOperation({ summary: 'List Mcd' })
  @Get('mcd')
  listMcd(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.tasks.listMcdItems(user, q);
  }

  /** CRM Queries inbox (notification threads) */
  @ApiOperation({ summary: 'List Queries' })
  @Get('queries')
  listQueries(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.threads.listThreads(user, q);
  }
}
