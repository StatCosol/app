import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class RefactorAssignmentsTable1734950100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasAssigneeType = await queryRunner.hasColumn(
      'client_assignments',
      'assignee_type',
    );
    // If table is already in the new shape (baseline), skip
    if (!hasAssigneeType) {
      return;
    }

    // Drop old columns that used assigneeType pattern
    await queryRunner.dropColumn('client_assignments', 'assignee_type');
    await queryRunner.dropColumn('client_assignments', 'assignee_user_id');

    // Add new columns for specific CRM and Auditor assignments
    await queryRunner.addColumn(
      'client_assignments',
      new TableColumn({
        name: 'crm_user_id',
        type: 'int',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'client_assignments',
      new TableColumn({
        name: 'auditor_user_id',
        type: 'int',
        isNullable: true,
      }),
    );

    // Add UNIQUE constraint on clientId (one assignment per client)
    await queryRunner.createIndex(
      'client_assignments',
      new TableIndex({
        name: 'IDX_CLIENT_ASSIGNMENTS_CLIENT_UNIQUE',
        columnNames: ['client_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasCrm = await queryRunner.hasColumn(
      'client_assignments',
      'crm_user_id',
    );
    if (!hasCrm) {
      return;
    }

    await queryRunner.dropIndex(
      'client_assignments',
      'IDX_CLIENT_ASSIGNMENTS_CLIENT_UNIQUE',
    );
    await queryRunner.dropColumn('client_assignments', 'auditor_user_id');
    await queryRunner.dropColumn('client_assignments', 'crm_user_id');

    await queryRunner.addColumn(
      'client_assignments',
      new TableColumn({
        name: 'assignee_type',
        type: 'enum',
        enum: ['CRM', 'AUDITOR'],
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      'client_assignments',
      new TableColumn({
        name: 'assignee_user_id',
        type: 'int',
        isNullable: false,
      }),
    );
  }
}
