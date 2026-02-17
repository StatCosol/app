import { Injectable, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Central branch-access helper for CLIENT users.
 *
 * Rule:
 *  - Master user (0 rows in user_branches) → can access ALL branches of their client
 *  - Branch user (1+ rows in user_branches) → can only access mapped branches
 *
 * Usage in any CLIENT-scoped controller:
 *   const branchIds = await this.branchAccess.getUserBranchIds(req.user.userId);
 *   await this.branchAccess.assertBranchAccess(req.user.userId, targetBranchId);
 */
@Injectable()
export class BranchAccessService {
  constructor(private readonly ds: DataSource) {}

  /**
   * Returns the branch IDs this user is mapped to.
   * Empty array means MASTER user (can see all).
   */
  async getUserBranchIds(userId: string): Promise<string[]> {
    const rows: { branchId: string }[] = await this.ds.query(
      `SELECT branch_id AS "branchId" FROM user_branches WHERE user_id = $1`,
      [userId],
    );
    return rows.map((r) => r.branchId);
  }

  /** true if master (no branch mappings), false if branch user */
  async isMasterUser(userId: string): Promise<boolean> {
    const ids = await this.getUserBranchIds(userId);
    return ids.length === 0;
  }

  /**
   * Get the allowed branch IDs for a CLIENT user.
   * Master users get ALL branches for their client.
   * Branch users get only their mapped branches.
   */
  async getAllowedBranchIds(
    userId: string,
    clientId: string,
  ): Promise<string[] | 'ALL'> {
    const ids = await this.getUserBranchIds(userId);
    if (ids.length === 0) return 'ALL'; // master
    return ids;
  }

  /**
   * Assert that the user can access a specific branch.
   * Master users always pass.
   * Branch users must have the branch in their mappings.
   */
  async assertBranchAccess(userId: string, branchId: string): Promise<void> {
    const ids = await this.getUserBranchIds(userId);
    if (ids.length === 0) return; // master → all access
    if (!ids.includes(branchId)) {
      throw new ForbiddenException('You do not have access to this branch');
    }
  }

  /**
   * Assert that only branch users can perform this action (e.g. MCD upload).
   * Master users are blocked.
   */
  async assertBranchUserOnly(userId: string, branchId: string): Promise<void> {
    const ids = await this.getUserBranchIds(userId);
    if (ids.length === 0) {
      throw new ForbiddenException(
        'Master user cannot perform this action. Only branch users can upload.',
      );
    }
    if (!ids.includes(branchId)) {
      throw new ForbiddenException('You do not have access to this branch');
    }
  }

  /**
   * Filter a list of branches to only those the user can access.
   * Master users get all back. Branch users get only their mapped ones.
   */
  async filterBranches<T extends { id: string }>(
    userId: string,
    branches: T[],
  ): Promise<T[]> {
    const ids = await this.getUserBranchIds(userId);
    if (ids.length === 0) return branches; // master → all
    const set = new Set(ids);
    return branches.filter((b) => set.has(b.id));
  }
}
