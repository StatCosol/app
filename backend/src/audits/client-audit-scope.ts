import { ForbiddenException } from '@nestjs/common';
import { ReqUser } from '../access/access-scope.service';

type Db = { query(sql: string, params?: any[]): Promise<any> };
type BranchIds = { getUserBranchIds(userId: string): Promise<string[]> };

/**
 * A client user may see an audit of their own company; a branch-scoped user
 * only audits of their branches, or of contractors mapped to those branches.
 * Shared by the published-report and branch NC routes so they cannot drift.
 */
export async function assertClientAuditScope(
  db: Db,
  branchAccess: BranchIds,
  user: ReqUser,
  auditId: string,
): Promise<void> {
  const [audit] = await db.query(
    `SELECT client_id AS "clientId", branch_id AS "branchId", contractor_user_id AS "contractorUserId"
       FROM audits
      WHERE id = $1
      LIMIT 1`,
    [auditId],
  );
  if (!audit || audit.clientId !== user.clientId)
    throw new ForbiddenException('Audit not in client scope');
  const ids = await branchAccess.getUserBranchIds(user.userId);
  if (user.userType === 'BRANCH' && !ids.length)
    throw new ForbiddenException('No assigned branches');
  if (audit.branchId && ids.length && !ids.includes(audit.branchId))
    throw new ForbiddenException('Audit not in branch scope');
  if (!audit.branchId && audit.contractorUserId && ids.length) {
    const mapped = await db.query(
      'SELECT 1 FROM branch_contractor WHERE branch_id = ANY($1::uuid[]) AND contractor_user_id = $2 LIMIT 1',
      [ids, audit.contractorUserId],
    );
    if (!mapped.length)
      throw new ForbiddenException('Audit not in branch scope');
  }
}
