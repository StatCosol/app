import * as fs from 'fs';
import * as path from 'path';
import type { Response } from 'express';
import { NotFoundException } from '@nestjs/common';

/**
 * Sanitize filename to prevent header injection and weird filesystem chars.
 * Keeps letters, numbers, space, dot, dash, underscore, parentheses.
 */
export function sanitizeFilename(name: string, fallback = 'download.bin') {
  const base = (name ?? '').toString().trim();
  if (!base) return fallback;

  // remove path separators and control chars
  const noCtrl = base.replace(/[\u0000-\u001F\u007F]/g, '');
  const noSlashes = noCtrl.replace(/[\\/]/g, '-');

  const safe = noSlashes.replace(/[^a-zA-Z0-9 ._\-()]/g, '_').slice(0, 200).trim();
  return safe || fallback;
}

/**
 * Optional: ensure file path is within uploads root.
 * If your uploads root differs, adjust it (e.g. "uploads").
 */
export function assertWithinUploadsRoot(filePath: string) {
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  const resolved = path.resolve(filePath);

  if (!resolved.startsWith(uploadsRoot + path.sep) && resolved !== uploadsRoot) {
    // If you store outside "uploads", either adjust uploadsRoot or remove this guard
    throw new NotFoundException('File not found');
  }
}

export function safeSendFile(res: Response, filePath: string, fileName: string, mimeType?: string) {
  if (!filePath) throw new NotFoundException('File not found');

  // Optional containment guard (turn off if your storage path is different)
  // assertWithinUploadsRoot(filePath);

  if (!fs.existsSync(filePath)) throw new NotFoundException('File not found');

  const safeName = sanitizeFilename(fileName, 'download.bin');

  // set headers (res.download also sets some headers but we control it explicitly)
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');

  if (mimeType) res.type(mimeType);

  return res.sendFile(path.resolve(filePath));
}
