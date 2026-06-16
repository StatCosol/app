import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'face_liveness_nonces' })
@Index(['deviceId'])
@Index(['nonce'], { unique: true })
export class FaceLivenessNonceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'device_id', type: 'uuid' })
  deviceId: string;

  @Column({ name: 'nonce', type: 'varchar', length: 100, unique: true })
  nonce: string;

  @Column({ name: 'challenge_type', type: 'varchar', length: 30 })
  challengeType: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
