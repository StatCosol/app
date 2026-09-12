import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';

export function isAppraisalBranch(user: ReqUser): boolean {
  return (
    user.roleCode === 'BRANCH_DESK' ||
    (user.roleCode === 'CLIENT' && user.userType === 'BRANCH')
  );
}
export function appraisalFilter(
  user: ReqUser,
  filter: { clientId?: string; branchId?: string },
) {
  if (user.roleCode === 'ADMIN') return filter;
  if (!user.clientId) throw new ForbiddenException('Company scope is required');
  if (filter.clientId && filter.clientId !== user.clientId)
    throw new ForbiddenException('Company not in scope');
  const result = { ...filter, clientId: user.clientId };
  if (isAppraisalBranch(user)) {
    if (!user.branchIds?.length)
      throw new ForbiddenException('Branch scope is required');
    if (filter.branchId && !user.branchIds.includes(filter.branchId))
      throw new ForbiddenException('Branch not in scope');
    result.branchId = filter.branchId || user.branchIds[0];
  }
  return result;
}
@Injectable()
export class AppraisalScopeGuard implements CanActivate {
  constructor(private readonly db: DataSource) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user as ReqUser;
    appraisalFilter(user, {
      clientId: req.query?.clientId || req.body?.clientId,
      branchId: req.query?.branchId,
    });
    const cycles = /\/appraisal\/cycles(?:\/|$)/.test(req.path || req.url);
    const templates = /\/appraisal\/templates(?:\/|$)/.test(
      req.path || req.url,
    );
    const scales = /\/scales(?:\/|$)/.test(req.path || req.url);
    const reports = /\/appraisal\/reports(?:\/|$)/.test(req.path || req.url);
    const branch = isAppraisalBranch(user);
    if (reports && branch)
      throw new ForbiddenException('Company-level reporting is required');
    if (user.roleCode !== 'ADMIN') {
      for (const [key, table] of [
        ['templateId', 'appraisal_templates'],
        ['ratingScaleId', 'appraisal_rating_scales'],
      ] as const) {
        const ref = req.body?.[key];
        if (ref) {
          const [owner] = await this.db.query(
            'SELECT client_id FROM ' + table + ' WHERE id = $1',
            [ref],
          );
          if (!owner || (owner.client_id && owner.client_id !== user.clientId))
            throw new ForbiddenException(
              'Referenced appraisal setup not in scope',
            );
        }
      }
      for (const scope of req.body?.scopes || []) {
        if (scope.branchId) {
          const [owner] = await this.db.query(
            'SELECT clientid AS client_id FROM client_branches WHERE id = $1',
            [scope.branchId],
          );
          if (!owner || owner.client_id !== user.clientId)
            throw new ForbiddenException('Scope branch not in company');
        }
      }
    }
    if (
      branch &&
      req.method !== 'GET' &&
      (cycles ||
        templates ||
        /\/(client-approve|lock)$/.test(req.path || req.url))
    ) {
      throw new ForbiddenException('Company approval is required');
    }
    const id = req.params?.id;
    if (!id) return true;
    const [record] = await this.db.query(
      templates
        ? 'SELECT client_id FROM ' +
            (scales ? 'appraisal_rating_scales' : 'appraisal_templates') +
            ' WHERE id = $1'
        : cycles
          ? 'SELECT client_id FROM appraisal_cycles WHERE id = $1'
          : 'SELECT client_id, branch_id FROM employee_appraisals WHERE id = $1',
      [id],
    );
    if (!record) throw new NotFoundException('Appraisal record not found');
    if (user.roleCode === 'ADMIN') return true;
    if (
      (record.client_id !== user.clientId &&
        !(templates && record.client_id === null)) ||
      (!cycles &&
        !templates &&
        branch &&
        !user.branchIds.includes(record.branch_id))
    ) {
      throw new ForbiddenException('Appraisal record not in scope');
    }
    if (cycles && branch) {
      const scopes = await this.db.query(
        'SELECT branch_id FROM appraisal_cycle_scopes WHERE cycle_id = $1 AND is_active = true',
        [id],
      );
      if (
        scopes.length &&
        !scopes.some(
          (s: { branch_id: string | null }) =>
            !s.branch_id || user.branchIds.includes(s.branch_id),
        )
      ) {
        throw new ForbiddenException('Appraisal cycle not in scope');
      }
    }
    return true;
  }
}
