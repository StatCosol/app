import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { ScopedListQueryDto } from '../common/dto/scoped-list-query.dto';
import { ThreadListService } from '../list-queries/thread-list.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

/**
 * Standardised list endpoints for Admin portal.
 */
@ApiTags('Admin')
@ApiBearerAuth('JWT')
@Controller({ path: 'admin', version: '1' })
@Roles('ADMIN')
export class AdminListController {
  constructor(private readonly threads: ThreadListService) {}

  /** Admin Notifications (threads) — paginated, searchable */
  @ApiOperation({ summary: 'List Notifications' })
  @Get('notifications/list')
  listNotifications(
    @CurrentUser() user: ReqUser,
    @Query() q: ScopedListQueryDto,
  ) {
    return this.threads.listThreads(user, q);
  }
}
