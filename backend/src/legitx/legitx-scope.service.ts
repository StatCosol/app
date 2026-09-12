import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccessScopeService, ReqUser } from '../access/access-scope.service';
import { BranchAccessService } from '../auth/branch-access.service';

@Injectable()
export class LegitxScopeService {
  constructor(
    private readonly access: AccessScopeService,
    private readonly branches: BranchAccessService,
    private readonly db: DataSource,
  ) {}
  async resolve(
    user: ReqUser,
    query: { clientId?: string; branchId?: string },
  ) {
    const scope = await this.access.getScope(user);
    let clientId = scope.clientId || user.clientId || query.clientId || null;
    if (query.clientId && clientId && query.clientId !== clientId)
      throw new ForbiddenException('Company not in scope');
    if (query.branchId) {
      const [branch] = await this.db.query(
        'SELECT clientid FROM client_branches WHERE id = $1 AND isdeleted = false',
        [query.branchId],
      );
      if (!branch || (clientId && branch.clientid !== clientId))
        throw new ForbiddenException('Branch not in company');
      clientId = branch.clientid;
    }
    if (
      scope.level === 'clients' &&
      (!clientId || !scope.clientIds?.includes(clientId))
    )
      throw new ForbiddenException('Select an assigned company or branch');
    let allowedBranchIds: string[] | 'ALL' = 'ALL';
    if (scope.level === 'branches') {
      const mapped = await this.branches.getUserBranchIds(
        user.id || user.userId,
      );
      const rows = await this.db.query(
        'SELECT id FROM client_branches WHERE clientid = $1 AND id = ANY($2::uuid[]) AND isdeleted = false',
        [clientId, mapped],
      );
      allowedBranchIds = rows.map((row: { id: string }) => row.id);
      if (!allowedBranchIds.length)
        throw new ForbiddenException('No assigned branches');
    }
    if (
      query.branchId &&
      allowedBranchIds !== 'ALL' &&
      !allowedBranchIds.includes(query.branchId)
    )
      throw new ForbiddenException('Branch not in scope');
    return {
      clientId,
      branchId:
        query.branchId ||
        (allowedBranchIds !== 'ALL' && allowedBranchIds.length === 1
          ? allowedBranchIds[0]
          : null),
      allowedBranchIds,
    };
  }
}
