import * as fs from 'fs';
import * as path from 'path';
import { FilesService } from './files.service';

/**
 * Every /uploads request looks the requested path up in each of these
 * columns. They must all be indexed, or a single file open becomes a series
 * of full table scans.
 */
describe('uploads path lookup indexes', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '../../migrations/20261127_uploads_path_indexes.sql'),
    'utf8',
  );
  const indexed = new Set(
    Array.from(
      migration.matchAll(/ARRAY\['([a-z_]+)', '([a-z_]+)'\]/g),
      (m) => `${m[1]}.${m[2]}`,
    ),
  );

  it('indexes every column of the scoped document tables', () => {
    const specs = (
      FilesService as unknown as {
        SCOPED_DOCUMENT_TABLES: Array<{ table: string; pathColumn: string }>;
      }
    ).SCOPED_DOCUMENT_TABLES;
    expect(specs.length).toBeGreaterThan(0);
    const missing = specs
      .map((s) => `${s.table}.${s.pathColumn}`)
      .filter((key) => !indexed.has(key));
    expect(missing).toEqual([]);
  });

  it('indexes every path column queried directly by the download check', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'files.service.ts'),
      'utf8',
    );
    // e.g. "FROM notice_documents d ... WHERE d.file_url = ANY($1::text[])":
    // resolve the WHERE alias against the FROM/JOIN of the same query.
    const direct = Array.from(
      source.matchAll(
        /WHERE\s+(?:([a-z]+)\.)?([a-z_]+)\s*=\s*ANY\(\$1::text\[\]\)/g,
      ),
    ).map((m) => {
      const [, alias, column] = m;
      const before = source.slice(0, m.index);
      const queryStart = Math.max(
        before.lastIndexOf('query('),
        before.lastIndexOf('`'),
      );
      const query = before.slice(queryStart);
      const table = alias
        ? new RegExp(`(?:FROM|JOIN)\\s+([a-z_]+)\\s+${alias}\\b`).exec(
            query,
          )?.[1]
        : /FROM\s+([a-z_]+)/.exec(query)?.[1];
      return `${table}.${column}`;
    });
    expect(direct.length).toBeGreaterThanOrEqual(4);
    expect(direct.filter((key) => !indexed.has(key))).toEqual([]);
  });

  it('indexes the repository-based lookups', () => {
    for (const key of [
      'contractor_documents.file_path',
      'payroll_input_files.file_path',
      'registers_records.file_path',
      'helpdesk_message_files.file_path',
    ]) {
      expect(indexed.has(key)).toBe(true);
    }
  });
});
