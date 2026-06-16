import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { FaceLivenessNonceEntity } from './liveness-nonce.entity';

const CHALLENGE_TYPES = ['BLINK', 'SMILE', 'HEAD_TURN_LEFT', 'HEAD_TURN_RIGHT'] as const;

const LIVENESS_NONCE_TTL_MS = 2 * 60 * 1000;
const OFFLINE_LIVENESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class LivenessService {
  constructor(
    @InjectRepository(FaceLivenessNonceEntity)
    private readonly nonceRepo: Repository<FaceLivenessNonceEntity>,
    private readonly dataSource: DataSource,
  ) {}

  get livenessRequired(): boolean {
    const env = process.env.FACE_LIVENESS_CHALLENGE_REQUIRED;
    return env === undefined || env === 'true';
  }

  /**
   * Issue a new liveness challenge nonce for a device.
   */
  async issueChallenge(
    deviceId: string,
    _employeeId?: string,
    offline = false,
  ): Promise<{ nonce: string; challengeType: string; expiresAt: Date }> {
    const challengeType =
      CHALLENGE_TYPES[Math.floor(Math.random() * CHALLENGE_TYPES.length)];
    const nonce = randomBytes(32).toString('hex');
    const ttl = offline ? OFFLINE_LIVENESS_MAX_AGE_MS : LIVENESS_NONCE_TTL_MS;
    const expiresAt = new Date(Date.now() + ttl);

    const entity = this.nonceRepo.create({ deviceId, nonce, challengeType, expiresAt });
    await this.nonceRepo.save(entity);

    return { nonce, challengeType, expiresAt };
  }

  /**
   * Atomically consume a nonce. Throws BadRequestException if invalid.
   * Returns true on success.
   */
  async consumeNonce(
    deviceId: string,
    nonce: string,
    suppliedType: string,
  ): Promise<true> {
    const result = await this.dataSource.query<Array<{ challenge_type: string }>>(
      `UPDATE face_liveness_nonces
         SET consumed_at = now()
       WHERE nonce = $1
         AND device_id = $2
         AND consumed_at IS NULL
         AND expires_at > now()
       RETURNING challenge_type`,
      [nonce, deviceId],
    );

    if (!result || result.length === 0) {
      throw new BadRequestException('Liveness nonce invalid, expired, or already used');
    }

    const storedType: string = result[0].challenge_type;
    if (storedType.toUpperCase() !== suppliedType.toUpperCase()) {
      throw new BadRequestException(
        `Liveness challenge type mismatch: expected ${storedType}, got ${suppliedType}`,
      );
    }

    return true;
  }

  /** Purge expired/consumed nonces older than 24 h (for maintenance jobs). */
  async pruneOldNonces(): Promise<void> {
    await this.nonceRepo
      .createQueryBuilder()
      .delete()
      .where(`created_at < now() - interval '24 hours'`)
      .execute();
  }
}
