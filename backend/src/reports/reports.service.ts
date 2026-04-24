import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplianceTask } from '../compliance/entities/compliance-task.entity';
import { AssignmentsService } from '../assignments/assignments.service';
import * as ExcelJS from 'exceljs';
import type { Response } from 'express';
import { ReqUser } from '../access/access-scope.service';

interface ComplianceSummaryFilters {
  clientId?: string;
  branchId?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  status?: string;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(ComplianceTask)
    private readonly tasks: Repository<ComplianceTask>,
    private readonly assignmentsService: AssignmentsService,
  ) {}

  async complianceSummary(user: ReqUser, q: ComplianceSummaryFilters) {
    try {
      const role = user?.roleCode as string | undefined;

      if (!role || !['ADMIN', 'CRM', 'CLIENT'].includes(role)) {
        throw new ForbiddenException('Access denied');
      }

      const qb = this.tasks.createQueryBuilder('t');

      // Scope by role
      if (role === 'CLIENT') {
        if (!user.clientId) {
          throw new ForbiddenException('Client missing clientId');
        }
        qb.andWhere('t.clientId = :clientId', {
          clientId: user.clientId,
        });
      } else if (role === 'CRM') {
        const assigned = await this.assignmentsService.getAssignedClientsForCrm(
          user.userId,
        );
        const clientIds = (assigned || []).map((c) => c.id);
        if (!clientIds.length) {
          return this.emptySummary();
        }
        qb.andWhere('t.clientId IN (:...clientIds)', { clientIds });
      }

      // Explicit filters
      if (q.clientId && role !== 'CLIENT') {
        qb.andWhere('t.clientId = :clientIdFilter', {
          clientIdFilter: q.clientId,
        });
      }

      if (q.branchId) {
        qb.andWhere('t.branchId = :branchId', { branchId: q.branchId });
      }

      if (q.status) {
        qb.andWhere('t.status = :status', { status: q.status });
      }

      if (q.from) {
        qb.andWhere('t.dueDate >= :from', { from: q.from });
      }

      if (q.to) {
        qb.andWhere('t.dueDate <= :to', { to: q.to });
      }

      const rows = await qb
        .select('t.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('t.status')
        .getRawMany();

      if (!rows.length) {
        return this.emptySummary();
      }

      const byStatus = new Map<string, number>();
      for (const r of rows) {
        byStatus.set(String(r.status), Number(r.count));
      }

      const total = Array.from(byStatus.values()).reduce((a, b) => a + b, 0);
      const approved = byStatus.get('APPROVED') ?? 0;
      const overdue = byStatus.get('OVERDUE') ?? 0;

      // Treat all non-approved, non-overdue tasks as pending bucket
      const pending = total - approved - overdue;
      const percentage = total > 0 ? (approved / total) * 100 : 0;

      return {
        total,
        approved,
        pending,
        overdue,
        percentage,
        byStatus: Object.fromEntries(byStatus.entries()),
      };
    } catch (err) {
      this.logger.error('complianceSummary query failed', (err as Error).stack);
      return this.emptySummary();
    }
  }

  async overdue(user: ReqUser, q: ComplianceSummaryFilters) {
    try {
      const role = user?.roleCode as string | undefined;

      if (!role || !['ADMIN', 'CRM', 'CLIENT'].includes(role)) {
        throw new ForbiddenException('Access denied');
      }

      const qb = this.tasks
        .createQueryBuilder('t')
        .leftJoin('t.branch', 'b')
        .leftJoin('t.compliance', 'c')
        .where('t.status = :status', { status: 'OVERDUE' });

      // Scope by role
      if (role === 'CLIENT') {
        if (!user.clientId) {
          throw new ForbiddenException('Client missing clientId');
        }
        qb.andWhere('t.clientId = :clientId', {
          clientId: user.clientId,
        });
      } else if (role === 'CRM') {
        const assigned = await this.assignmentsService.getAssignedClientsForCrm(
          user.userId,
        );
        const clientIds = (assigned || []).map((c) => c.id);
        if (!clientIds.length) {
          return [];
        }
        qb.andWhere('t.clientId IN (:...clientIds)', { clientIds });
      }

      // Explicit filters
      if (q.clientId && role !== 'CLIENT') {
        qb.andWhere('t.clientId = :clientIdFilter', {
          clientIdFilter: q.clientId,
        });
      }

      if (q.branchId) {
        qb.andWhere('t.branchId = :branchId', { branchId: q.branchId });
      }

      if (q.from) {
        qb.andWhere('t.dueDate >= :from', { from: q.from });
      }

      if (q.to) {
        qb.andWhere('t.dueDate <= :to', { to: q.to });
      }

      const rows = await qb
        .select('t.id', 'id')
        .addSelect('t.clientId', 'clientId')
        .addSelect(
          "COALESCE(b.branchName, CONCAT('Branch #', t.branchId))",
          'branchName',
        )
        .addSelect('c.complianceName', 'complianceName')
        .addSelect('t.dueDate', 'dueDate')
        .addSelect('t.status', 'status')
        .orderBy('t.dueDate', 'ASC')
        .addOrderBy('t.id', 'ASC')
        .getRawMany();

      return rows.map((r: { id: string; clientId: string; branchName: string | null; complianceName: string | null; dueDate: string; status: string }) => ({
        id: r.id,
        clientId: r.clientId,
        branchName: r.branchName as string | null,
        complianceName: (r.complianceName as string | null) || '',
        dueDate: String(r.dueDate),
        status: String(r.status),
      }));
    } catch (err) {
      this.logger.error('complianceSummary query failed', (err as Error).stack);
      return [];
    }
  }

  async contractorPerformance(user: ReqUser, q: ComplianceSummaryFilters) {
    try {
      const role = user?.roleCode as string | undefined;

      if (!role || !['ADMIN', 'CRM', 'CLIENT'].includes(role)) {
        throw new ForbiddenException('Access denied');
      }

      const qb = this.tasks
        .createQueryBuilder('t')
        .leftJoin('t.assignedTo', 'u')
        .where('t.assignedToUserId IS NOT NULL');

      // Scope by role
      if (role === 'CLIENT') {
        if (!user.clientId) {
          throw new ForbiddenException('Client missing clientId');
        }
        qb.andWhere('t.clientId = :clientId', {
          clientId: user.clientId,
        });
      } else if (role === 'CRM') {
        const assigned = await this.assignmentsService.getAssignedClientsForCrm(
          user.userId,
        );
        const clientIds = (assigned || []).map((c) => c.id);
        if (!clientIds.length) {
          return [];
        }
        qb.andWhere('t.clientId IN (:...clientIds)', { clientIds });
      }

      // Explicit filters
      if (q.clientId && role !== 'CLIENT') {
        qb.andWhere('t.clientId = :clientIdFilter', {
          clientIdFilter: q.clientId,
        });
      }

      if (q.branchId) {
        qb.andWhere('t.branchId = :branchId', { branchId: q.branchId });
      }

      if (q.from) {
        qb.andWhere('t.dueDate >= :from', { from: q.from });
      }

      if (q.to) {
        qb.andWhere('t.dueDate <= :to', { to: q.to });
      }

      const rows = await qb
        .select('t.assignedToUserId', 'contractorId')
        .addSelect(
          "COALESCE(u.name, CONCAT('User #', t.assignedToUserId))",
          'contractorName',
        )
        .addSelect('t.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('t.assignedToUserId')
        .addGroupBy('u.name')
        .addGroupBy('t.status')
        .orderBy('u.name', 'ASC')
        .getRawMany();

      const map = new Map<
        string,
        {
          contractorId: string;
          contractorName: string;
          submitted: number;
          approved: number;
          overdue: number;
        }
      >();

      for (const r of rows) {
        const contractorId = String(r.contractorId);
        const contractorName = String(r.contractorName);
        const status = String(r.status);
        const count = Number(r.count);

        const entry = map.get(contractorId) || {
          contractorId,
          contractorName,
          submitted: 0,
          approved: 0,
          overdue: 0,
        };

        if (status === 'SUBMITTED') entry.submitted += count;
        if (status === 'APPROVED') entry.approved += count;
        if (status === 'OVERDUE') entry.overdue += count;

        map.set(contractorId, entry);
      }

      return Array.from(map.values());
    } catch (err) {
      this.logger.error(
        'contractorPerformance query failed',
        (err as Error).stack,
      );
      return [];
    }
  }

  async exportOverdueExcel(
    user: ReqUser,
    q: ComplianceSummaryFilters,
    res: Response,
  ) {
    const role = user?.roleCode as string | undefined;

    if (!role || !['ADMIN', 'CRM'].includes(role)) {
      throw new ForbiddenException('Access denied');
    }

    const data = await this.overdue(user, q);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Overdue Report');

    ws.columns = [
      { header: 'Task ID', key: 'id', width: 10 },
      { header: 'Client ID', key: 'clientId', width: 10 },
      { header: 'Branch', key: 'branchName', width: 25 },
      { header: 'Compliance', key: 'complianceName', width: 35 },
      { header: 'Due Date', key: 'dueDate', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
    ];

    ws.getRow(1).font = { bold: true };

    for (const t of data) {
      ws.addRow({
        id: t.id,
        clientId: t.clientId,
        branchName: t.branchName || '',
        complianceName: t.complianceName || '',
        dueDate: t.dueDate,
        status: t.status,
      });
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="overdue_report.xlsx"',
    );

    await wb.xlsx.write(res);
    res.end();
  }

  private emptySummary() {
    return {
      total: 0,
      approved: 0,
      pending: 0,
      overdue: 0,
      percentage: 0,
      byStatus: {},
    };
  }
}
