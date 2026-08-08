import { ForbiddenException } from '@nestjs/common';

/**
 * Portal JWT punch endpoints are disabled by default. Set
 * FACEDESK_ALLOW_JWT_PUNCH=true only for controlled staging tests.
 */
export function assertFaceDeskJwtPunchAllowed(): void {
  if (process.env.FACEDESK_ALLOW_JWT_PUNCH === 'true') return;
  throw new ForbiddenException(
    'Portal punch is disabled. Mark attendance from a provisioned kiosk device.',
  );
}
