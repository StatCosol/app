import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type MobileDeviceMode = 'KIOSK' | 'ESS';

@Entity({ name: 'mobile_attendance_devices' })
@Index(['clientId'])
@Index(['branchId'])
export class MobileAttendanceDeviceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'mode', type: 'varchar', length: 16, default: 'KIOSK' })
  mode: MobileDeviceMode;

  @Column({ name: 'device_label', type: 'varchar', length: 120, nullable: true })
  deviceLabel: string | null;

  @Column({ name: 'android_id', type: 'varchar', length: 120, nullable: true })
  androidId: string | null;

  @Column({ name: 'install_token', type: 'varchar', length: 64, unique: true })
  installToken: string;

  @Column({ name: 'install_token_hash', type: 'varchar', length: 120, nullable: true })
  installTokenHash: string | null;

  @Column({ name: 'geofence_lat', type: 'numeric', precision: 10, scale: 7, nullable: true, transformer: { from: (v: string | null) => (v == null ? null : Number(v)), to: (v: number | null) => v } })
  geofenceLat: number | null;

  @Column({ name: 'geofence_lng', type: 'numeric', precision: 10, scale: 7, nullable: true, transformer: { from: (v: string | null) => (v == null ? null : Number(v)), to: (v: number | null) => v } })
  geofenceLng: number | null;

  @Column({ name: 'geofence_radius_m', type: 'integer', nullable: true })
  geofenceRadiusM: number | null;

  /** ESS-mode only: the employee this personal-phone device is bound to. */
  @Column({ name: 'ess_employee_id', type: 'uuid', nullable: true })
  essEmployeeId: string | null;

  @CreateDateColumn({ name: 'registered_at', type: 'timestamptz' })
  registeredAt: Date;

  @Column({ name: 'registered_by', type: 'uuid', nullable: true })
  registeredBy: string | null;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @Column({ name: 'last_punch_at', type: 'timestamptz', nullable: true })
  lastPunchAt: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy: string | null;
}
