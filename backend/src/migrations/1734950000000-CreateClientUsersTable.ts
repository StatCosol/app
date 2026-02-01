import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreateClientUsersTable1734950000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Skip if baseline already created this table
    const hasClientUsers = await queryRunner.hasTable('client_users');
    if (hasClientUsers) {
      return;
    }

    // Create client_users mapping table
    await queryRunner.createTable(
      new Table({
        name: 'client_users',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'clientId',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Add UNIQUE constraint on userId (one user can belong to only one client)
    await queryRunner.createIndex(
      'client_users',
      new TableIndex({
        name: 'IDX_CLIENT_USERS_USERID_UNIQUE',
        columnNames: ['userId'],
        isUnique: true,
      }),
    );

    // Add index on clientId for faster lookups
    await queryRunner.createIndex(
      'client_users',
      new TableIndex({
        name: 'IDX_CLIENT_USERS_CLIENTID',
        columnNames: ['clientId'],
      }),
    );

    // Add foreign key to clients table
    await queryRunner.createForeignKey(
      'client_users',
      new TableForeignKey({
        columnNames: ['clientId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'clients',
        onDelete: 'CASCADE',
      }),
    );

    // Add foreign key to users table
    await queryRunner.createForeignKey(
      'client_users',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasClientUsers = await queryRunner.hasTable('client_users');
    if (hasClientUsers) {
      await queryRunner.dropTable('client_users');
    }
  }
}
