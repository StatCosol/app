import { randomBytes } from 'crypto';

/** 144 random bits; fixed characters satisfy the existing password policy. */
export function generateSecurePassword(): string {
  return 'Sc@9' + randomBytes(18).toString('base64url');
}
