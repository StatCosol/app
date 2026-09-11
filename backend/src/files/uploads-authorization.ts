import type { RequestHandler } from 'express';
import { JwtService } from '@nestjs/jwt';
import { JwtStrategy } from '../auth/jwt.strategy';
import { FilesService } from './files.service';

/** Static files must use the same current user and ownership checks as APIs. */
export function uploadsAuthorization(
  jwt: JwtService,
  strategy: JwtStrategy,
  files: FilesService,
): RequestHandler {
  return async (req, res, next) => {
    let relative: string;
    try {
      relative = decodeURIComponent(req.path)
        .replace(/\\/g, '/')
        .replace(/^\/+/, '');
      if (
        relative.split('/').some((p) => p === '..' || p === '.') ||
        relative.includes('\0')
      ) {
        res.status(404).json({ message: 'Not found' });
        return;
      }
    } catch {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    if (/^(logos|news)\//.test(relative)) return next();
    // Biometric photos have dedicated scoped endpoints, never static delivery.
    if (
      /^(face-photos|temp|payroll-breakups|payroll-run-employees)\//.test(
        relative,
      )
    ) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    let user: Awaited<ReturnType<JwtStrategy['validate']>>;
    try {
      const header = req.headers.authorization ?? '';
      if (!header.startsWith('Bearer ')) throw new Error('Missing token');
      user = await strategy.validate(jwt.verify(header.slice(7)));
    } catch {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    try {
      await files.assertCanDownload(user, relative);
      next();
    } catch (err) {
      const status = (err as { status?: number })?.status === 400 ? 404 : 403;
      res
        .status(status)
        .json({ message: status === 404 ? 'Not found' : 'File access denied' });
    }
  };
}
