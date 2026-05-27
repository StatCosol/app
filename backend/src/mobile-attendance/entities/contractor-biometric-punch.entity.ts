import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Phase 4d: kiosk punches for contractor employees.
 *
 * Parallels BiometricPunchEntity (employee punches) — kept in a separate
 * table so payroll / attendance roll-ups that read biometric_punches stay
 * untouched. Idempotency is enforced by a UNIQUE index on
 * (client_id, contractor_employee_id, punch_time).
 */
@Entity({ name: 'contractor_biometric_punches' })
@Index(['clientId', 'punchTime'])
@Index(['contractorEmployeeId', 'punchTime'])
export class ContractorBiometricPunchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'contractor_employee_id', type: 'uuid' })
  contractorEmployeeId: string;

  @Column({ name: 'punch_time', type: 'timestamptz' })
  punchTime: Date;

  @Column({
    name: 'direction',
    type: 'varchar',
    length: 10,
    default: 'AUTO',
  })
  direction: 'IN' | 'OUT' | 'AUTO';

  @Column({
    name: 'source',
    type: 'varchar',
    length: 20,
    default: 'MOBILE_KIOSK',
  })
  source: 'MOBILE_KIOSK' | 'MOBILE_ESS' | 'DEVICE' | 'IMPORT' | 'MANUAL';

  @Column({ name: 'mobile_device_id', type: 'uuid', nullable: true })
  mobileDeviceId: string | null;

  @Column({ name: 'device_id', type: 'varchar', length: 80, nullable: true })
  deviceId: string | null;

  @Column({ name: 'capture_lat', type: 'numeric', nullable: true })
  captureLat: string | null;

  @Column({ name: 'capture_lng', type: 'numeric', nullable: true })
  captureLng: string | null;

  @Column({ name: 'capture_accuracy_m', type: 'numeric', nullable: true })
  captureAccuracyM: string | null;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl: string | null;

  @Column({ name: 'match_score', type: 'numeric', nullable: true })
  matchScore: string | null;

  @Column({ name: 'liveness_score', type: 'numeric', nullable: true })
  livenessScore: string | null;

  @Column({
    name: 'match_provider',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  matchProvider: string | null;

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload: Record<string, unknown> | null;

  @Column({ name: 'attendance_id', type: 'uuid', nullable: true })
  attendanceId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
