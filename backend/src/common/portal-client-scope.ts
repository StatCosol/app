import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReqUser } from '../access/access-scope.service';

/** CLIENT master/branch scope for operational records; never infer master from empty mappings. */
export function applyClientBranchScope(
  qb: { andWhere(sql: string, params?: object): unknown },
  user: ReqUser,
  branchColumn: string,
) {
  if (!user.id || !user.clientId || user.roleCode !== 'CLIENT')
    throw new ForbiddenException('Client context required');
  if (user.userType === 'MASTER') return;
  qb.andWhere(
    `EXISTS (SELECT 1 FROM user_branches portal_ub JOIN client_branches portal_b ON portal_b.id=portal_ub.branch_id WHERE portal_ub.user_id=:portalUser AND portal_ub.branch_id=${branchColumn} AND portal_b.clientid=:portalClient AND portal_b.isactive=TRUE AND portal_b.isdeleted=FALSE)`,
    { portalUser: user.id, portalClient: user.clientId },
  );
}
export async function assertClientRecord(
  ds: Pick<DataSource, 'query'>,
  user: ReqUser,
  clientId: string,
  branchId?: string | null,
) {
  if (
    !user.id ||
    !user.clientId ||
    user.roleCode !== 'CLIENT' ||
    user.clientId !== clientId
  )
    throw new ForbiddenException('Not your client');
  if (!branchId) {
    if (user.userType !== 'MASTER')
      throw new ForbiddenException('An assigned branch is required');
    return;
  }
  const rows = await ds.query(
    `SELECT b.id FROM client_branches b WHERE b.id=$1 AND b.clientid=$2 AND b.isactive=TRUE AND b.isdeleted=FALSE AND ($3::boolean OR EXISTS(SELECT 1 FROM user_branches ub WHERE ub.branch_id=b.id AND ub.user_id=$4))`,
    [branchId, clientId, user.userType === 'MASTER', user.id],
  );
  if (!rows.length)
    throw new ForbiddenException('Branch is outside your scope');
}
