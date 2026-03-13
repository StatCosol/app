import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReqUser } from '../access/access-scope.service';
import { ScopedListQueryDto } from '../common/dto/scoped-list-query.dto';
import { DocListService } from '../list-queries/doc-list.service';
import { ThreadListService } from '../list-queries/thread-list.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

/**
 * Standardised list endpoints for ConTrack (Contractor) portal.
 */
@ApiTags('Contractor')
@ApiBearerAuth('JWT')
@Controller({ path: 'contractor', version: '1' })
@Roles('CONTRACTOR', 'CLIENT', 'CRM')
export class ContractorListController {
  constructor(
    private readonly docs: DocListService,
    private readonly threads: ThreadListService,
  ) {}

  /** Contractor documents list */
  @ApiOperation({ summary: 'List Documents' })
  @Get('documents')
  listDocuments(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.docs.listContractorDocs(user, q);
  }

  /** Contractor queries list */
  @ApiOperation({ summary: 'List Queries' })
  @Get('queries')
  listQueries(@CurrentUser() user: ReqUser, @Query() q: ScopedListQueryDto) {
    return this.threads.listThreads(user, q);
  }
}
