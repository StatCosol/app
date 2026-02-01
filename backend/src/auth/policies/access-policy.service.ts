import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AccessPolicyService {
  constructor(private readonly ds: DataSource) {}

  async assertClientAccess(user: any, clientId: string) {
    const role = user?.roleCode;
    const userId = user?.id;
    if (!role) throw new ForbiddenException('Access denied');

    if (role === 'ADMIN' || role === 'CEO' || role === 'CCO') return;

    if (role === 'CLIENT') {
      if (user?.clientId !== clientId)
        throw new ForbiddenException('Client access denied');
      return;
    }

    if (role === 'CRM' || role === 'AUDITOR') {
      const type = role === 'CRM' ? 'CRM' : 'AUDITOR';
      const rows = await this.ds.query(
        `
        SELECT 1
        FROM client_assignments_current
        WHERE client_id = $1
          AND assignment_type = $2
          AND assigned_to_user_id = $3
        LIMIT 1
        `,
        [clientId, type, userId],
      );
      if (!rows.length)
        throw new ForbiddenException('Not assigned to this client');
      return;
    }

    if (role === 'CONTRACTOR') {
      const rows = await this.ds.query(
        `
        SELECT 1
        FROM branch_contractors bc
        JOIN client_branches b ON b.id = bc."branchId"
        WHERE bc."contractorUserId" = $1 AND b."clientId" = $2
        LIMIT 1
        `,
        [userId, clientId],
      );
      if (!rows.length)
        throw new ForbiddenException('Contractor client access denied');
      return;
    }

    throw new ForbiddenException('Access denied');
  }

  async assertBranchAccess(user: any, branchId: string) {
    const rows = await this.ds.query(
      `SELECT "clientId" FROM client_branches WHERE id = $1 LIMIT 1`,
      [branchId],
    );
    if (!rows.length) throw new ForbiddenException('Branch not found');
    await this.assertClientAccess(user, rows[0].clientId);
  }

  async assertThreadAccess(user: any, threadId: string) {
    const role = user?.roleCode;
    if (!role) throw new ForbiddenException('Access denied');

    if (role === 'ADMIN' || role === 'CEO' || role === 'CCO') return;

    const rows = await this.ds.query(
      `
      SELECT 1
      FROM notification_thread_participants
      WHERE thread_id = $1 AND user_id = $2
      LIMIT 1
      `,
      [threadId, user?.id],
    );
    if (!rows.length) throw new ForbiddenException('Thread access denied');
  }
}
