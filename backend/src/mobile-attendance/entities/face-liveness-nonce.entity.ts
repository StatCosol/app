import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Phase 4c: server-issued single-use liveness challenge nonces. See
 * migration `20260525_face_liveness_nonces.sql` for the rationale and
 * the consume-on-punch flow.
 */
@Entity({ name: 'face_liveness_nonces' })
@Index(['deviceId', 'consumedAt'])
@Index(['expiresAt'])
export class FaceLivenessNonceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'device_id', type: 'uuid' })
  deviceId: string;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId: string | null;

  @Column({ name: 'nonce', type: 'text', unique: true })
  nonce: string;

  @Column({ name: 'challenge_type', type: 'text' })
  challengeType: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
