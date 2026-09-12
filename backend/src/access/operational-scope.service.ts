import { ForbiddenException, Injectable } from '@nestjs/common';
import { FindOptionsWhere, In, ObjectLiteral } from 'typeorm';
import {
  AccessScopeService,
  ReqUser,
  ScopeResult,
} from './access-scope.service';

/** Operational company/branch data. Employee-owned records need their own ownership policy. */
@Injectable()
export class OperationalScopeService {
  constructor(private readonly access: AccessScopeService) {}

  async resolve(
    user: ReqUser,
    clientId?: string | null,
    branchId?: string | null,
  ): Promise<ScopeResult> {
    const scope: ScopeResult =
      user.roleCode === 'CCO'
        ? {
            level: 'clients',
            clientIds: await this.access.getCcoClientIds(
              user.userId ?? user.id,
            ),
          }
        : await this.access.getScope(user);
    if (clientId) {
      if (
        (scope.level === 'clients' && !scope.clientIds?.includes(clientId)) ||
        ((scope.level === 'client' || scope.level === 'branches') &&
          scope.clientId !== clientId)
      ) {
        throw new ForbiddenException(
          'Company is outside your operational scope',
        );
      }
      await this.access.assertClientAllowed(user, clientId);
      if (user.roleCode === 'CCO')
        await this.access.assertCcoClientAllowed(user, clientId);
    }
    if (branchId) {
      await this.access.assertBranchAllowed(user, branchId);
      if (user.roleCode === 'CCO')
        await this.access.assertCcoBranchAllowed(user, branchId);
      if (scope.level === 'branches' && !scope.branchIds?.includes(branchId))
        throw new ForbiddenException(
          'Branch is outside your operational scope',
        );
    }
    return scope;
  }

  async where<T extends ObjectLiteral>(
    user: ReqUser,
    clientId?: string | null,
    branchId?: string | null,
  ): Promise<FindOptionsWhere<T>> {
    const scope = await this.resolve(user, clientId, branchId);
    const where: Record<string, unknown> = {};
    if (scope.level === 'clients') where.clientId = In(scope.clientIds || []);
    if (scope.level === 'client' || scope.level === 'branches')
      where.clientId = scope.clientId;
    if (scope.level === 'branches') where.branchId = In(scope.branchIds || []);
    if (clientId) where.clientId = clientId;
    if (branchId) where.branchId = branchId;
    return where as FindOptionsWhere<T>;
  }

  async assertRecord(
    user: ReqUser,
    row: { clientId: string; branchId?: string | null },
  ) {
    const scope = await this.resolve(user, row.clientId, row.branchId);
    if (
      scope.level === 'branches' &&
      (!row.branchId || !scope.branchIds?.includes(row.branchId))
    ) {
      throw new ForbiddenException('Record is outside your assigned branches');
    }
  }
}
