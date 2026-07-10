import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MarkAttendanceDto, SaveEnrollmentDto } from './facedesk.dto';

/**
 * Guards the whitelist-validation contract: the global ValidationPipe runs
 * with forbidNonWhitelisted, so every DTO property must be decorated. A
 * missing decorator would reject real kiosk payloads with "property X should
 * not exist" (the 400 seen on-device 2026-07-08).
 */
describe('FaceDesk DTO validation', () => {
  it('accepts a real enrollment payload from the kiosk', async () => {
    const dto = plainToInstance(SaveEnrollmentDto, {
      employeeId: '11111111-1111-4111-8111-111111111111',
      frames: [
        { embeddingB64: 'AAAA', embeddingModel: 'mobilefacenet' },
        { embeddingB64: 'BBBB', embeddingModel: 'mobilefacenet' },
      ],
      livenessPassed: true,
      consentGiven: true,
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts a real attendance payload from the kiosk', async () => {
    const dto = plainToInstance(MarkAttendanceDto, {
      frames: [{ embeddingB64: 'AAAA', embeddingModel: 'mobilefacenet' }],
      livenessPassed: true,
      offlineRef: 'ref-1',
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects unknown properties (forbidNonWhitelisted)', async () => {
    const dto = plainToInstance(MarkAttendanceDto, {
      frames: [],
      bogusField: 'x',
    } as any);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});
