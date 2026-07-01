import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { FaceLivenessNonceEntity } from './liveness-nonce.entity';

const DEFAULT_CHALLENGE_TYPES = ['BLINK'] as const;
const ALLOWED_CHALLENGE_TYPES = new Set([
  'BLINK',
  'SMILE',
  'HEAD_TURN_LEFT',
  'HEAD_TURN_RIGHT',
]);

function configuredChallengeTypes(): string[] {
  if (process.env.FACE_ALLOW_ADVANCED_LIVENESS_CHALLENGES !== 'true') {
    return [...DEFAULT_CHALLENGE_TYPES];
  }

  const configured = (process.env.FACE_LIVENESS_CHALLENGE_TYPES ?? '')
    .split(',')
    .map((type) => type.trim().toUpperCase())
    .filter((type) => ALLOWED_CHALLENGE_TYPES.has(type));
  return configured.length > 0 ? configured : [...DEFAULT_CHALLENGE_TYPES];
}

const LIVENESS_NONCE_TTL_MS = 2 * 60 * 1000;
const OFFLINE_LIVENESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class LivenessService {
  private readonly logger = new Logger(LivenessService.name);

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
    const challengeTypes = configuredChallengeTypes();
    const challengeType =
      challengeTypes[Math.floor(Math.random() * challengeTypes.length)];
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

  /** Purge expired/consumed nonces older than 24 h — runs nightly via cron. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneOldNonces(): Promise<void> {
    try {
      const result = await this.nonceRepo
        .createQueryBuilder()
        .delete()
        .where(`created_at < now() - interval '24 hours'`)
        .execute();
      this.logger.log(`Pruned ${result.affected ?? 0} expired liveness nonces.`);
    } catch (err) {
      this.logger.error('Liveness nonce pruning failed', err);
    }
  }
}
