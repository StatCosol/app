import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { DataSource } from 'typeorm';

@Injectable()
export class InvoiceFileInventoryService {
  private readonly directory = path.resolve(
    process.cwd(),
    'uploads',
    'invoices',
  );
  constructor(private readonly ds: DataSource) {}

  async preview(role: string, minAgeDays: number) {
    if (role !== 'ADMIN')
      throw new ForbiddenException('Administrator access required');
    if (!Number.isInteger(minAgeDays) || minAgeDays < 1 || minAgeDays > 36500)
      throw new BadRequestException('Age must be between 1 and 36500 days');
    const files: {
      name: string;
      bytes: number;
      ageDays: number;
      blocked: boolean;
    }[] = [];
    let truncated = false;
    let rootExists = false;
    try {
      const root = await fs.lstat(this.directory);
      rootExists = true;
      if (!root.isDirectory() || root.isSymbolicLink())
        throw new Error('Unsafe inventory root');
      const directory = await fs.opendir(this.directory);
      let visited = 0;
      for await (const entry of directory) {
        if (++visited > 1000) {
          truncated = true;
          break;
        }
        if (!entry.name.toLowerCase().endsWith('.pdf')) continue;
        const stat = await fs.lstat(path.join(this.directory, entry.name));
        files.push({
          name: entry.name,
          bytes: stat.size,
          ageDays: Math.max(
            0,
            Math.floor((Date.now() - stat.mtimeMs) / 86400000),
          ),
          blocked: !stat.isFile() || stat.isSymbolicLink(),
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new ServiceUnavailableException(
          'Invoice file inventory is unavailable. No files were changed.',
        );
      // A missing directory is an empty store; a file disappearing mid-scan
      // makes the result incomplete and must never be interpreted as deletion approval.
      truncated = rootExists;
    }
    const paths = files.map((file) => '/uploads/invoices/' + file.name);
    const references: { pdf_path: string }[] = paths.length
      ? await this.ds.query(
          `SELECT pdf_path FROM invoices WHERE pdf_path=ANY($1::text[])
       UNION SELECT pdf_path FROM invoice_deliveries WHERE pdf_path=ANY($1::text[])`,
          [paths],
        )
      : [];
    const referenced = new Set(references.map((row) => row.pdf_path));
    return {
      deletionEnabled: false,
      truncated,
      scanned: files.length,
      minAgeDays,
      items: files
        .map((file) => ({
          name: file.name,
          bytes: file.bytes,
          ageDays: file.ageDays,
          status: file.blocked
            ? 'BLOCKED'
            : referenced.has('/uploads/invoices/' + file.name)
              ? 'REFERENCED'
              : file.ageDays < minAgeDays
                ? 'RECENT'
                : 'UNREGISTERED',
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}
