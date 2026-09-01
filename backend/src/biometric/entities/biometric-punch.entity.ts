import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'biometric_punches' })
@Index(['clientId', 'punchTime'])
@Index(['employeeId', 'punchTime'])
@Index(['clientId', 'employeeCode', 'punchTime'])
export class BiometricPunchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  /** Set when the punch came from an EMPLOYEE device and the code matched. */
  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId: string | null;

  /**
   * Set when the punch came from a CONTRACTOR device and the code matched.
   * Exactly one of employeeId / contractorEmployeeId is populated; both null
   * means the User ID matched nobody and the punch is awaiting reconcile.
   */
  @Column({ name: 'contractor_employee_id', type: 'uuid', nullable: true })
  contractorEmployeeId: string | null;

  @Column({ name: 'employee_code', type: 'varchar', length: 50 })
  employeeCode: string;

  @Column({ name: 'punch_time', type: 'timestamptz' })
  punchTime: Date;

  @Column({
    name: 'direction',
    type: 'varchar',
    length: 10,
    default: 'AUTO',
  })
  direction: 'IN' | 'OUT' | 'AUTO';

  @Column({ name: 'device_id', type: 'varchar', length: 80, nullable: true })
  deviceId: string | null;

  @Column({
    name: 'source',
    type: 'varchar',
    length: 20,
    default: 'DEVICE',
  })
  source: 'DEVICE' | 'IMPORT' | 'MANUAL' | 'MOBILE_KIOSK' | 'MOBILE_ESS';

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload: Record<string, unknown> | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ name: 'attendance_id', type: 'uuid', nullable: true })
  attendanceId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
