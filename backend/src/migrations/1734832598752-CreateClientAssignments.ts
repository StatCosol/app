import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateClientAssignments1734832598752 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // If baseline already created this table, skip to avoid duplicate constraints
    const hasClientAssignments =
      await queryRunner.hasTable('client_assignments');
    if (hasClientAssignments) {
      return;
    }

    // Create enum types
    await queryRunner.query(`
      CREATE TYPE "assignee_type_enum" AS ENUM ('CRM', 'AUDITOR');
    `);

    await queryRunner.query(`
      CREATE TYPE "assignment_status_enum" AS ENUM ('ACTIVE', 'INACTIVE');
    `);

    // Create client_assignments table
    await queryRunner.createTable(
      new Table({
        name: 'client_assignments',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'client_id',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'assignee_type',
            type: 'assignee_type_enum',
            isNullable: false,
          },
          {
            name: 'assignee_user_id',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'start_date',
            type: 'date',
            isNullable: false,
          },
          {
            name: 'end_date',
            type: 'date',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'assignment_status_enum',
            default: "'ACTIVE'",
            isNullable: false,
          },
          {
            name: 'created_by',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Add foreign key to clients table
    await queryRunner.createForeignKey(
      'client_assignments',
      new TableForeignKey({
        columnNames: ['client_id'],
        referencedTableName: 'clients',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Add foreign key to users table for assignee
    await queryRunner.createForeignKey(
      'client_assignments',
      new TableForeignKey({
        columnNames: ['assignee_user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Add foreign key to users table for created_by
    await queryRunner.createForeignKey(
      'client_assignments',
      new TableForeignKey({
        columnNames: ['created_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Create partial unique index for active CRM assignments (one active CRM per client)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_active_client_crm" 
      ON "client_assignments" ("client_id") 
      WHERE "assignee_type" = 'CRM' AND "end_date" IS NULL AND "status" = 'ACTIVE';
    `);

    // Create partial unique index for active Auditor assignments (one active Auditor per client)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_active_client_auditor" 
      ON "client_assignments" ("client_id") 
      WHERE "assignee_type" = 'AUDITOR' AND "end_date" IS NULL AND "status" = 'ACTIVE';
    `);

    // Create index for faster lookups by assignee
    await queryRunner.createIndex(
      'client_assignments',
      new TableIndex({
        name: 'idx_assignee_user',
        columnNames: ['assignee_user_id', 'assignee_type'],
      }),
    );

    // Create index for faster lookups by client
    await queryRunner.createIndex(
      'client_assignments',
      new TableIndex({
        name: 'idx_client_id',
        columnNames: ['client_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasClientAssignments =
      await queryRunner.hasTable('client_assignments');

    // Drop indexes
    if (hasClientAssignments) {
      await queryRunner.dropIndex('client_assignments', 'idx_client_id');
      await queryRunner.dropIndex('client_assignments', 'idx_assignee_user');
      await queryRunner.query(
        `DROP INDEX IF EXISTS "uq_active_client_auditor"`,
      );
      await queryRunner.query(`DROP INDEX IF EXISTS "uq_active_client_crm"`);

      // Drop foreign keys
      const table = await queryRunner.getTable('client_assignments');
      if (table) {
        const foreignKeys = table.foreignKeys;
        for (const fk of foreignKeys) {
          await queryRunner.dropForeignKey('client_assignments', fk);
        }
      }

      // Drop table
      await queryRunner.dropTable('client_assignments', true);
    }

    // Drop enum types
    await queryRunner.query(`DROP TYPE IF EXISTS "assignment_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "assignee_type_enum"`);
  }
}
