import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddThreadKeyToNotificationThreads1734980000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notification_threads"
      ADD COLUMN IF NOT EXISTS "thread_key" VARCHAR(80) NULL;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_notification_thread_key"
      ON "notification_threads"("thread_key")
      WHERE "thread_key" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "uq_notification_thread_key";',
    );
    await queryRunner.query(
      'ALTER TABLE "notification_threads" DROP COLUMN IF EXISTS "thread_key";',
    );
  }
}
