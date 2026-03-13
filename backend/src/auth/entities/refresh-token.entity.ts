import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('refresh_tokens')
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** JWT ID (jti) — unique identifier embedded in the refresh JWT */
  @Index('IDX_REFRESH_TOKENS_JTI', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  jti: string;

  @Index('IDX_REFRESH_TOKENS_USERID')
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  /**
   * Token family UUID — all tokens in a rotation chain share the same family.
   * If a revoked token from this family is reused, the entire family is revoked
   * (refresh-token reuse detection).
   */
  @Index('IDX_REFRESH_TOKENS_FAMILY')
  @Column({ type: 'uuid' })
  family: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
