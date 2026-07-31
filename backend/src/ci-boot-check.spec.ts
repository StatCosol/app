import 'reflect-metadata';
import { DataSource } from 'typeorm';
import path from 'node:path';

/**
 * Boot-safety check: initialize a TypeORM DataSource with EVERY entity (same
 * glob the app's data source uses) against a real Postgres. TypeORM builds and
 * validates all entity metadata during initialize(), so this catches the class
 * of bug that unit tests miss and that repeatedly reached production —
 * e.g. `DataTypeNotSupportedError: Data type "Object"` from a `string | null`
 * column with no explicit `@Column type`, which crashes the backend on boot.
 *
 * Runs only when a database is configured (the CI "boot check" step sets DB_*);
 * it self-skips in the normal mocked unit-test run so local `npm test` and the
 * unit CI step need no Postgres.
 */
const dbConfigured = !!process.env.DB_HOST;
const suite = dbConfigured ? describe : describe.skip;

suite('CI boot check — entity metadata builds against Postgres', () => {
  it('initializes a DataSource with all entities (no unsupported column types)', async () => {
    const ds = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      synchronize: false,
      entities: [path.join(__dirname, '/**/*.entity{.ts,.js}')],
    });
    try {
      await ds.initialize();
      expect(ds.isInitialized).toBe(true);
    } finally {
      if (ds.isInitialized) await ds.destroy();
    }
  }, 30_000);
});
