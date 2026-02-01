import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStateCodeHeadcountToBranches1735000000000 implements MigrationInterface {
  name = 'AddStateCodeHeadcountToBranches1735000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "client_branches" ADD COLUMN IF NOT EXISTS "stateCode" character varying(10)`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_branches" ADD COLUMN IF NOT EXISTS "headcount" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "client_branches" DROP COLUMN IF EXISTS "headcount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_branches" DROP COLUMN IF EXISTS "stateCode"`,
    );
  }
}
