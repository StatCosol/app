import { Request } from 'express';

/** Extract the kiosk device install token from Authorization or legacy header. */
export function readDeviceInstallToken(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    return token || null;
  }
  const legacy = req.headers['x-install-token'];
  if (typeof legacy === 'string' && legacy.trim()) {
    return legacy.trim();
  }
  return null;
}
