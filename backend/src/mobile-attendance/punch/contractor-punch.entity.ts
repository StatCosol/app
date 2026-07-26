import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'contractor_biometric_punches' })
@Index(['clientId', 'contractorEmployeeId'])
export class ContractorBiometricPunchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'device_id', type: 'uuid' })
  deviceId: string;

  @Column({ name: 'contractor_employee_id', type: 'uuid' })
  contractorEmployeeId: string;

  @Column({ name: 'direction', type: 'varchar', length: 5, default: 'AUTO' })
  direction: 'IN' | 'OUT' | 'AUTO';

  @Column({ name: 'punch_time', type: 'timestamptz' })
  punchTime: Date;

  @Column({ name: 'match_score', type: 'numeric', nullable: true })
  matchScore: number | null;

  @Column({ name: 'match_cosine', type: 'numeric', nullable: true })
  matchCosine: number | null;

  @Column({ name: 'match_threshold', type: 'numeric', nullable: true })
  matchThreshold: number | null;

  @Column({ name: 'match_margin', type: 'numeric', nullable: true })
  matchMargin: number | null;

  @Column({ name: 'match_margin_threshold', type: 'numeric', nullable: true })
  matchMarginThreshold: number | null;

  @Column({
    name: 'second_best_subject_type',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  secondBestSubjectType: string | null;

  @Column({ name: 'second_best_subject_id', type: 'uuid', nullable: true })
  secondBestSubjectId: string | null;

  @Column({ name: 'second_best_cosine', type: 'numeric', nullable: true })
  secondBestCosine: number | null;

  @Column({ name: 'gallery_size', type: 'int', nullable: true })
  gallerySize: number | null;

  @Column({ name: 'liveness_score', type: 'numeric', nullable: true })
  livenessScore: number | null;

  @Column({
    name: 'liveness_challenge_type',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  livenessChallengeType: string | null;

  @Column({
    name: 'liveness_challenge_passed_at',
    type: 'timestamptz',
    nullable: true,
  })
  livenessChallengePassedAt: Date | null;

  @Column({
    name: 'liveness_nonce',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  livenessNonce: string | null;

  @Column({
    name: 'embedding_model',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  embeddingModel: string | null;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl: string | null;

  @Column({ name: 'capture_lat', type: 'numeric', nullable: true })
  captureLat: number | null;

  @Column({ name: 'capture_lng', type: 'numeric', nullable: true })
  captureLng: number | null;

  @Column({ name: 'ip', type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'is_mock_location', type: 'boolean', nullable: true })
  isMockLocation: boolean | null;

  @Column({ name: 'is_rooted', type: 'boolean', nullable: true })
  isRooted: boolean | null;

  @Column({ name: 'offline_sync', type: 'boolean', default: false })
  offlineSync: boolean;

  @Column({
    name: 'offline_ref',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  offlineRef: string | null;

  /** See MobileAttendancePunchEntity.decision */
  @Column({ name: 'decision', type: 'varchar', length: 20, default: 'AUTO' })
  decision: string;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
