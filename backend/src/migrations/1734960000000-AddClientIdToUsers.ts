import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from 'typeorm';

export class AddClientIdToUsers1734960000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasClientId = await queryRunner.hasColumn('users', 'clientId');
    if (hasClientId) {
      return;
    }

    // Add clientId column to users table
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'clientId',
        type: 'int',
        isNullable: true,
      }),
    );

    // Add foreign key constraint to clients table
    await queryRunner.createForeignKey(
      'users',
      new TableForeignKey({
        name: 'fk_users_client',
        columnNames: ['clientId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'clients',
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasClientId = await queryRunner.hasColumn('users', 'clientId');
    if (hasClientId) {
      await queryRunner.dropForeignKey('users', 'fk_users_client');
      await queryRunner.dropColumn('users', 'clientId');
    }
  }
}
