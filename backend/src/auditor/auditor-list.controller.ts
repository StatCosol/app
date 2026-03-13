import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { ScopedListQueryDto } from '../common/dto/scoped-list-query.dto';
import { DocListService } from '../list-queries/doc-list.service';
import { AuditListService } from '../list-queries/audit-list.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

/**
 * Standardised list endpoints for AuditXpert portal.
 */
@ApiTags('Auditor')
@ApiBearerAuth('JWT')
@Controller({ path: 'auditor', version: '1' })
@Roles('AUDITOR')
export class AuditorListController {
  constructor(
    private readonly docs: DocListService,
    private readonly audits: AuditListService,
  ) {}

  /** Auditor documents review queue */
  @ApiOperation({ summary: 'List Documents' })
  @Get('documents')
  listDocuments(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.docs.listComplianceDocs(user, q);
  }

  /** Auditor audits list */
  @ApiOperation({ summary: 'List Audits' })
  @Get('audits')
  listAudits(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.audits.list(user, q);
  }
}
