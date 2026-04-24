import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TaskEngineService } from './task-engine.service';

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

  async openMonthlyCycle(
    month: number,
    year: number,
  ): Promise<OpenMonthlyCycleResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get all live branches
      const branches = await queryRunner.query(
        `
        SELECT
          b.id,
          b.client_id,
          b.branchname AS branch_name,
          b.state_code,
          b.branch_category AS branch_type,
          COALESCE(b.status, 'ACTIVE') AS status
        FROM client_branches b
        WHERE b.deleted_at IS NULL
          AND COALESCE(b.status, 'ACTIVE') = 'ACTIVE'
        `,
      );

      let cyclesCreated = 0;
      let itemsCreated = 0;
      let tasksCreated = 0;

      for (const branch of branches) {
        const existingCycle = await queryRunner.query(
          `
          SELECT id
          FROM monthly_compliance_cycles
          WHERE branch_id = $1
            AND month = $2
            AND year = $3
          LIMIT 1
          `,
          [branch.id, month, year],
        );

        let cycleId: string;

        if (existingCycle.length > 0) {
          cycleId = existingCycle[0].id;
        } else {
          const insertedCycle = await queryRunner.query(
            `
            INSERT INTO monthly_compliance_cycles
              (client_id, branch_id, month, year, status, opened_at, created_at, updated_at)
            VALUES
              ($1, $2, $3, $4, 'OPEN', NOW(), NOW(), NOW())
            RETURNING id
            `,
            [branch.client_id, branch.id, month, year],
          );

          cycleId = insertedCycle[0].id;
          cyclesCreated += 1;
        }

        // Pull branch applicable monthly compliances
        const applicableItems = await queryRunner.query(
          `
          SELECT
            ucm.id AS compliance_id,
            ucm.name,
            ucm.code,
            ucm.frequency
          FROM unit_compliance_master ucm
          JOIN compliance_applicability ca ON ca.compliance_id = ucm.id
          WHERE ca.branch_category = (
            SELECT branch_category FROM client_branches WHERE id = $1
          )
          AND ca.is_active = true
          AND COALESCE(ucm.frequency, '') IN ('MONTHLY', 'MONTHLY_RETURN')
          `,
          [branch.id],
        );

        for (const item of applicableItems) {
          const alreadyExists = await queryRunner.query(
            `
            SELECT id
            FROM monthly_compliance_items
            WHERE cycle_id = $1
              AND compliance_id = $2
            LIMIT 1
            `,
            [cycleId, item.compliance_id],
          );

          if (alreadyExists.length > 0) {
            continue;
          }

          const dueDate = this.getMonthlyDueDate(year, month);

          const insertedItem = await queryRunner.query(
            `
            INSERT INTO monthly_compliance_items
              (
                cycle_id,
                compliance_id,
                item_name,
                responsible_role,
                due_date,
                status,
                source_type,
                created_at,
                updated_at
              )
            VALUES
              ($1, $2, $3, 'BRANCH', $4, 'PENDING', 'SYSTEM', NOW(), NOW())
            RETURNING id
            `,
            [cycleId, item.compliance_id, item.name, dueDate],
          );

          itemsCreated += 1;

          await this.taskEngine.createTask({
            module: 'COMPLIANCE',
            title: item.name,
            description: `Upload monthly compliance document for ${item.name}`,
            referenceId: insertedItem[0].id,
            referenceType: 'MONTHLY_COMPLIANCE_ITEM',
            priority: 'HIGH',
            assignedRole: 'BRANCH',
            clientId: branch.client_id,
            branchId: branch.id,
            dueDate,
          });

          tasksCreated += 1;
        }
      }

      await queryRunner.commitTransaction();

      return {
        month,
        year,
        cyclesCreated,
        itemsCreated,
        tasksCreated,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private getMonthlyDueDate(year: number, month: number): Date {
    // Default: 20th of current month
    return new Date(year, month - 1, 20, 23, 59, 59);
  }
}
