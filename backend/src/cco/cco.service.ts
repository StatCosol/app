import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class CcoService {
  constructor(private readonly dataSource: DataSource) {}

  // --- Real DB query for CRMs under this CCO ---
  async getCrmsUnderMe(user: any) {
    // Find CRM roleId
    const crmRole = await this.dataSource
      .getRepository('roles')
      .findOne({ where: { code: 'CRM' } });
    if (!crmRole) return [];
    // Find all CRM users where ownerCcoId = user.userId (exclude deleted)
    const crms = await this.dataSource.getRepository('users').find({
      where: { ownerCcoId: user.userId, roleId: crmRole.id, deletedAt: null },
      select: ['id', 'name', 'isActive', 'email'],
      order: { name: 'ASC' },
    });

    // For each CRM, count assigned clients
    const clientRepo = this.dataSource.getRepository('clients');
    const result: Array<{
      name: string;
      status: string;
      clientCount: number;
      overdueCount: number;
      lastLogin: string;
    }> = [];
    for (const crm of crms) {
      const clientCount = await clientRepo.count({
        where: { assignedCrmId: crm.id, status: 'ACTIVE' },
      });
      // TODO: Replace with real overdueCount and lastLogin if available
      result.push({
        name: crm.name,
        status: crm.isActive ? 'ACTIVE' : 'INACTIVE',
        clientCount,
        overdueCount: 0, // Placeholder
        lastLogin: '', // Placeholder
      });
    }
    return result;
  }

  async getApprovals(user: any) {
    // TODO: Query CRM deletion requests assigned to this CCO (required_approver_user_id = user.userId)
    return [
      {
        id: 1,
        crmName: 'CRM John',
        email: 'john@crm.com',
        requestedBy: 'Admin',
        requestedAt: '2025-12-20',
        reason: 'Resignation',
        status: 'PENDING',
      },
    ];
  }

  async approveRequest(user: any, id: number) {
    // TODO: Approve CRM deletion request with validation
    return { success: true };
  }

  async rejectRequest(user: any, id: number, remarks: string) {
    // TODO: Reject CRM deletion request with remarks
    return { success: true };
  }

  /**
   * Return escalated compliance tasks visible to this CCO.
   * Joins client + branch names so the frontend can display human-readable info.
   */
  async getOversight(_user: any) {
    const rows = await this.dataSource.query(`
      SELECT
        ct.id,
        c.client_name  AS "client",
        b.branch_name  AS "branch",
        ct.due_date    AS "dueDate",
        ct.status,
        ct.escalated_at AS "escalatedAt"
      FROM compliance_tasks ct
      LEFT JOIN clients  c ON c.id = ct.client_id
      LEFT JOIN branches b ON b.id = ct.branch_id
      WHERE ct.escalated_at IS NOT NULL
      ORDER BY ct.escalated_at DESC
      LIMIT 200
    `);
    return rows;
  }

  async getDashboard(user: any) {
    // TODO: Replace with real DB queries
    // 1. Find all CRMs where ownerCcoId = user.userId
    // 2. Count pending CRM deletion approvals assigned to this CCO
    // 3. Count all clients/tasks under those CRMs for overdue/escalations
    // 4. Aggregate top overdue clients/branches and CRMs with most overdue

    // Example placeholders:
    const pendingApprovals = 2; // await ...
    const totalCrms = 5; // await ...
    const overdueTasks = 12; // await ...
    const escalations = 3; // await ...
    const topOverdue = [
      { client: 'Client A', branch: 'Branch 1', count: 4 },
      { client: 'Client B', branch: 'Branch 2', count: 3 },
    ]; // await ...
    const crmsMostOverdue = [
      { crm: 'CRM John', overdue: 6 },
      { crm: 'CRM Jane', overdue: 4 },
    ]; // await ...

    return {
      pendingApprovals,
      totalCrms,
      overdueTasks,
      escalations,
      topOverdue,
      crmsMostOverdue,
    };
  }
}
