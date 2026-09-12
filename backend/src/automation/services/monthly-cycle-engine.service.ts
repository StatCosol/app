import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TaskEngineService } from './task-engine.service';
import { AutomationScope, scopedRows } from '../automation-scope';
export interface OpenMonthlyCycleResult {
  month: number;
  year: number;
  cyclesCreated: number;
  itemsCreated: number;
  tasksCreated: number;
}
@Injectable()
export class MonthlyCycleEngineService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly taskEngine: TaskEngineService,
  ) {}
  async candidates(scope: AutomationScope = {}) {
    return scopedRows(
      this.dataSource,
      `SELECT b.id AS branch_id,b.clientid AS client_id,ucm.id AS compliance_id,ucm.name AS title
      FROM client_branches b JOIN clients c ON c.id=b.clientid
      JOIN unit_applicable_compliance ca ON ca.branch_id=b.id AND ca.is_applicable=true
      JOIN unit_compliance_master ucm ON ucm.id=ca.compliance_id AND ucm.is_active=true
      WHERE b.isactive=true AND b.deletedat IS NULL AND c.is_deleted=false AND ucm.frequency IN ('MONTHLY','MONTHLY_RETURN')`,
      [],
      scope,
    );
  }
  async openMonthlyCycle(
    month: number,
    year: number,
    scope: AutomationScope = {},
  ): Promise<OpenMonthlyCycleResult> {
    if (
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100
    )
      throw new BadRequestException('Invalid cycle period');
    const candidates = await this.candidates(scope);
    const result = {
      month,
      year,
      cyclesCreated: 0,
      itemsCreated: 0,
      tasksCreated: 0,
    };
    for (const candidate of candidates) {
      const count = await this.dataSource.transaction(async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`monthly-cycle:${candidate.branch_id}:${year}:${month}`],
        );
        let [cycle] = await manager.query(
          'SELECT id,status FROM monthly_compliance_cycles WHERE branch_id=$1 AND year=$2 AND month=$3 ORDER BY created_at,id LIMIT 1',
          [candidate.branch_id, year, month],
        );
        let cyclesCreated = 0,
          itemsCreated = 0,
          tasksCreated = 0;
        if (
          cycle &&
          ['CLOSED', 'COMPLETED', 'APPROVED', 'CANCELLED'].includes(
            cycle.status,
          )
        )
          return { cyclesCreated, itemsCreated, tasksCreated };
        if (!cycle) {
          [cycle] = await manager.query(
            "INSERT INTO monthly_compliance_cycles(client_id,branch_id,year,month,status,opened_at) VALUES($1,$2,$3,$4,'OPEN',now()) RETURNING id",
            [candidate.client_id, candidate.branch_id, year, month],
          );
          cyclesCreated++;
        }
        let [item] = await manager.query(
          'SELECT id,status,due_date FROM monthly_compliance_items WHERE cycle_id=$1 AND compliance_id=$2 ORDER BY created_at,id LIMIT 1',
          [cycle.id, candidate.compliance_id],
        );
        const due = `${year}-${String(month).padStart(2, '0')}-20`;
        if (!item) {
          [item] = await manager.query(
            "INSERT INTO monthly_compliance_items(cycle_id,compliance_id,item_name,responsible_role,due_date,status,source_type) VALUES($1,$2,$3,'BRANCH',$4,'PENDING','SYSTEM') RETURNING id,status,due_date",
            [cycle.id, candidate.compliance_id, candidate.title, due],
          );
          itemsCreated++;
        }
        if (
          !['COMPLETED', 'APPROVED', 'CLOSED', 'CANCELLED'].includes(
            item.status,
          )
        ) {
          const existing = await manager.query(
            "SELECT id FROM system_tasks WHERE reference_id=$1 AND reference_type='MONTHLY_COMPLIANCE_ITEM'",
            [item.id],
          );
          await this.taskEngine.createTask(
            {
              module: 'COMPLIANCE',
              title: candidate.title,
              description: `Upload monthly compliance evidence for ${candidate.title}`,
              referenceId: item.id,
              referenceType: 'MONTHLY_COMPLIANCE_ITEM',
              priority: 'HIGH',
              assignedRole: 'BRANCH',
              clientId: candidate.client_id,
              branchId: candidate.branch_id,
              dueDate: new Date(item.due_date || due),
              reuseTerminal: true,
            },
            manager,
          );
          if (!existing.length) tasksCreated++;
        }
        return { cyclesCreated, itemsCreated, tasksCreated };
      });
      result.cyclesCreated += count.cyclesCreated;
      result.itemsCreated += count.itemsCreated;
      result.tasksCreated += count.tasksCreated;
    }
    return result;
  }
}
