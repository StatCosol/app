import { ForbiddenException } from '@nestjs/common';
import { assertFaceDeskJwtPunchAllowed } from './facedesk-jwt-punch.util';

describe('assertFaceDeskJwtPunchAllowed', () => {
  const prev = process.env.FACEDESK_ALLOW_JWT_PUNCH;

  afterEach(() => {
    if (prev === undefined) delete process.env.FACEDESK_ALLOW_JWT_PUNCH;
    else process.env.FACEDESK_ALLOW_JWT_PUNCH = prev;
  });

  it('blocks portal punch by default', () => {
    delete process.env.FACEDESK_ALLOW_JWT_PUNCH;
    expect(() => assertFaceDeskJwtPunchAllowed()).toThrow(ForbiddenException);
  });

  it('allows portal punch when explicitly enabled', () => {
    process.env.FACEDESK_ALLOW_JWT_PUNCH = 'true';
    expect(() => assertFaceDeskJwtPunchAllowed()).not.toThrow();
  });
});
