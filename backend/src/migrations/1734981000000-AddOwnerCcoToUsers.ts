import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from 'typeorm';

export class AddOwnerCcoToUsers1734981000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasOwnerCco = await queryRunner.hasColumn('users', 'ownerCcoId');
    if (hasOwnerCco) {
      return;
    }

    // Add ownerCcoId column to users table (self-referencing FK to users.id)
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'ownerCcoId',
        type: 'int',
        isNullable: true,
      }),
    );

    await queryRunner.createForeignKey(
      'users',
      new TableForeignKey({
        name: 'fk_users_owner_cco',
        columnNames: ['ownerCcoId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasOwnerCco = await queryRunner.hasColumn('users', 'ownerCcoId');
    if (hasOwnerCco) {
      await queryRunner.dropForeignKey('users', 'fk_users_owner_cco');
      await queryRunner.dropColumn('users', 'ownerCcoId');
    }
  }
}
