import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddComplianceTaskIndexes1734975000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_task_unique_period"
      ON "compliance_tasks" ("client_id", "branch_id", "compliance_id", "period_year", "period_month")
      WHERE "period_month" IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_task_unique_label"
      ON "compliance_tasks" ("client_id", "branch_id", "compliance_id", "period_year", "period_label")
      WHERE "period_label" IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_due_status"
      ON "compliance_tasks" ("due_date", "status");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_client_status"
      ON "compliance_tasks" ("client_id", "status");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_assignee_status"
      ON "compliance_tasks" ("assigned_to_user_id", "status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "idx_tasks_assignee_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_tasks_client_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_tasks_due_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "uq_task_unique_label"');
    await queryRunner.query('DROP INDEX IF EXISTS "uq_task_unique_period"');
  }
}
