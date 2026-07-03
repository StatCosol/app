import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SubmitKioskTicketDto } from './enrollment.dto';

describe('SubmitKioskTicketDto', () => {
  const basePayload = {
    ticketId: '11111111-1111-4111-8111-111111111111',
    embeddingFrames: ['frame-1', 'frame-2', 'frame-3'],
    livenessNonce: 'nonce-1',
    consentGiven: true,
  };

  it('accepts current kiosk payloads with livenessChallengeType', async () => {
    const dto = plainToInstance(SubmitKioskTicketDto, {
      ...basePayload,
      livenessChallengeType: 'BLINK',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts legacy kiosk payloads with challengeType only', async () => {
    const dto = plainToInstance(SubmitKioskTicketDto, {
      ...basePayload,
      challengeType: 'BLINK',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
