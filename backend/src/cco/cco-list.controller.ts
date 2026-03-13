import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { ScopedListQueryDto } from '../common/dto/scoped-list-query.dto';
import { EscalationListService } from '../list-queries/escalation-list.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

/**
 * Standardised list endpoints for CCO portal.
 */
@ApiTags('CCO')
@ApiBearerAuth('JWT')
@Controller({ path: 'cco', version: '1' })
@Roles('CCO')
export class CcoListController {
  constructor(private readonly escalations: EscalationListService) {}

  /** CCO Escalations list */
  @ApiOperation({ summary: 'List Escalations' })
  @Get('escalations')
  listEscalations(
    @CurrentUser() user: ReqUser,
    @Query() q: ScopedListQueryDto,
  ) {
    return this.escalations.list(user, q);
  }
}
