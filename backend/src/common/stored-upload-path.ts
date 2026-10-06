import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/** Resolve a registered local upload, including legacy /uploads/ keys; never fetch remote URLs. */
export function resolveStoredUploadPath(filePath: string): string {
  const unavailable = () =>
    new NotFoundException('Document file is unavailable.');
  if (
    !filePath ||
    /^https?:\/\//i.test(filePath) ||
    /(^|[\\/])\.\.([\\/]|$)/.test(filePath)
  )
    throw unavailable();
  const rootPath = path.resolve(process.cwd(), 'uploads');
  const normalized = filePath.replace(/\\/g, '/');
  const candidate = /^\/?uploads\//i.test(normalized)
    ? path.resolve(rootPath, normalized.replace(/^\/?uploads\//i, ''))
    : path.isAbsolute(filePath)
      ? path.resolve(filePath)
      : path.resolve(rootPath, filePath);
  const lexical = path.relative(rootPath, candidate);
  if (
    !lexical ||
    lexical.startsWith('..') ||
    path.isAbsolute(lexical) ||
    !fs.existsSync(rootPath) ||
    !fs.existsSync(candidate)
  )
    throw unavailable();
  const root = fs.realpathSync(rootPath);
  const resolved = fs.realpathSync(candidate);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw unavailable();
  return resolved;
}
