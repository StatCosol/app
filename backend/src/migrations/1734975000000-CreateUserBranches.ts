import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserBranches1734975000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_branches" (
        "user_id"   BIGINT NOT NULL,
        "branch_id" BIGINT NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_user_branches" PRIMARY KEY ("user_id", "branch_id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_branches_user" ON "user_branches"("user_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_branches_branch" ON "user_branches"("branch_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "user_branches";');
  }
}
