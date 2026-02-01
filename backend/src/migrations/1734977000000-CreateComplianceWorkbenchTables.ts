import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateComplianceWorkbenchTables1734977000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // compliance_tasks
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "compliance_tasks" (
        "id" SERIAL PRIMARY KEY,
        "client_id" INT NOT NULL,
        "branch_id" INT NULL,
        "compliance_id" INT NOT NULL,
        "period_year" INT NOT NULL,
        "period_month" INT NULL,
        "period_label" VARCHAR(30) NULL,
        "assigned_to_user_id" INT NULL,
        "assigned_by_user_id" INT NOT NULL,
        "due_date" DATE NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        "remarks" TEXT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_due_status" ON "compliance_tasks"("due_date", "status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_client_status" ON "compliance_tasks"("client_id", "status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_assignee_status" ON "compliance_tasks"("assigned_to_user_id", "status");
    `);

    // compliance_evidence
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "compliance_evidence" (
        "id" SERIAL PRIMARY KEY,
        "task_id" INT NOT NULL,
        "uploaded_by_user_id" INT NOT NULL,
        "file_name" VARCHAR(255) NOT NULL,
        "file_path" VARCHAR(500) NOT NULL,
        "file_type" VARCHAR(50) NULL,
        "file_size" INT NULL,
        "notes" TEXT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_compliance_evidence_task" ON "compliance_evidence"("task_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_compliance_evidence_uploaded_by" ON "compliance_evidence"("uploaded_by_user_id");
    `);

    // compliance_comments
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "compliance_comments" (
        "id" SERIAL PRIMARY KEY,
        "task_id" INT NOT NULL,
        "user_id" INT NOT NULL,
        "message" TEXT NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_compliance_comments_task" ON "compliance_comments"("task_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_compliance_comments_user" ON "compliance_comments"("user_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "compliance_comments";');
    await queryRunner.query('DROP TABLE IF EXISTS "compliance_evidence";');
    await queryRunner.query('DROP TABLE IF EXISTS "compliance_tasks";');
  }
}
