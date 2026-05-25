/**
 * Centralized, hardened multer upload options for client document uploads.
 *
 * Goals:
 *  - Whitelist by MIME + extension (defense-in-depth)
 *  - Enforce a per-file size limit
 *  - Generate a random server-side filename (no client-controlled path)
 *  - Sanitize the original name kept in DB metadata
 *  - Pair with `assertSafeFile()` AFTER multer to verify magic bytes
 *
 * Usage (disk storage):
 *   const opts = makeSafeUploadOptions({ folder: 'compliance', maxMb: 10 });
 *   @UseInterceptors(FileInterceptor('file', opts))
 *   upload(@UploadedFile() file: Express.Multer.File) {
 *     assertSafeFile(file);
 *     ...
 *   }
 *
 * Usage (memory storage – when you need to stream into another store):
 *   const opts = makeSafeUploadOptions({ memory: true, maxMb: 10 });
 */
import { BadRequestException } from '@nestjs/common';
import { diskStorage, memoryStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { validateUploadedFile } from './upload-validation';

export interface SafeUploadOptions {
  /** Subfolder under <cwd>/uploads. Required when memory=false. */
  folder?: string;
  /** Use in-memory storage instead of disk. */
  memory?: boolean;
  /** Maximum file size in megabytes. Default: 10. */
  maxMb?: number;
  /**
   * Allowed MIME types. Defaults to common document/image types.
   * Pass a stricter list for sensitive endpoints.
   */
  allowedMimes?: string[];
}

const DEFAULT_ALLOWED_MIMES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'text/csv',
  'text/plain',
];

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sanitizeExt(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return '';
  // Strip everything except a-z0-9 from the extension; cap at 10 chars
  return (
    '.' +
    filename
      .slice(dot + 1)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 10)
  );
}

export function makeSafeUploadOptions(opts: SafeUploadOptions = {}) {
  const maxMb = opts.maxMb ?? 10;
  const allowed = opts.allowedMimes ?? DEFAULT_ALLOWED_MIMES;

  const storage = opts.memory
    ? memoryStorage()
    : diskStorage({
        destination: (_req, _file, cb) => {
          if (!opts.folder) {
            return cb(
              new Error('safe-upload: folder is required for disk storage'),
              '',
            );
          }
          const base = path.join(process.cwd(), 'uploads', opts.folder);
          ensureDir(base);
          cb(null, base);
        },
        filename: (_req, file, cb) => {
          // Random server-side name; preserve only sanitized extension.
          cb(null, `${randomUUID()}${sanitizeExt(file.originalname)}`);
        },
      });

  return {
    storage,
    limits: {
      fileSize: maxMb * 1024 * 1024,
      files: 1,
    },
    fileFilter: (
      _req: unknown,
      file: { mimetype: string; originalname: string },
      cb: (err: Error | null, accept: boolean) => void,
    ) => {
      if (!allowed.includes(file.mimetype)) {
        return cb(
          new BadRequestException(
            `MIME type "${file.mimetype}" not allowed. Allowed: ${allowed.join(', ')}`,
          ),
          false,
        );
      }
      cb(null, true);
    },
  };
}

/**
 * Call AFTER multer has populated `file`. Verifies magic bytes for memory
 * uploads, and verifies the extension whitelist for disk uploads.
 *
 * Throws BadRequestException on mismatch.
 */
export function assertSafeFile(file: Express.Multer.File | undefined): void {
  if (!file) throw new BadRequestException('File is required');
  // Magic bytes are only available when buffer is present (memoryStorage).
  validateUploadedFile(file.originalname, file.buffer);
}

/**
 * Variant of `assertSafeFile()` for disk-storage uploads. Reads the first
 * 16 bytes off the saved file so magic-byte validation still runs even
 * when multer wrote straight to disk (so `file.buffer` is empty).
 *
 * On validation failure the saved file is unlinked before throwing.
 */
export function assertSafeFileOnDisk(
  file: Express.Multer.File | undefined,
): void {
  if (!file) throw new BadRequestException('File is required');
  // CodeQL barrier: confine fs ops to the uploads root regardless of what
  // multer (or a tampered request) put into file.path / file.originalname.
  const safePath = file.path ? resolveInsideUploadsRoot(file.path) : null;
  let head: Buffer | undefined;
  if (safePath) {
    let fd = -1;
    try {
      fd = fs.openSync(safePath, 'r');
      const buf = Buffer.alloc(16);
      const read = fs.readSync(fd, buf, 0, 16, 0);
      head = buf.slice(0, read);
    } catch {
      head = undefined;
    } finally {
      if (fd >= 0) {
        try {
          fs.closeSync(fd);
        } catch {
          /* ignore */
        }
      }
    }
  }
  try {
    validateUploadedFile(file.originalname, head);
  } catch (err) {
    if (safePath) {
      try {
        fs.unlinkSync(safePath);
      } catch {
        /* ignore */
      }
    }
    throw err;
  }
}

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');

function resolveInsideUploadsRoot(p: string): string | null {
  const resolved = path.resolve(p);
  if (resolved !== UPLOADS_ROOT && !resolved.startsWith(UPLOADS_ROOT + path.sep)) {
    return null;
  }
  return resolved;
}
