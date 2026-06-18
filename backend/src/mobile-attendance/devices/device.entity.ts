import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'mobile_attendance_devices' })
@Index(['clientId'])
export class MobileAttendanceDeviceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'mode', type: 'varchar', length: 10 })
  mode: 'KIOSK' | 'ESS';

  @Column({ name: 'install_token', type: 'varchar', length: 64, unique: true })
  installToken: string;

  @Column({ name: 'android_id', type: 'varchar', length: 100, nullable: true })
  androidId: string | null;

  @Column({ name: 'device_name', type: 'varchar', length: 200, nullable: true })
  deviceName: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  // ── Geofence config (Fix #13) ──────────────────────────────
  @Column({ name: 'geofence_lat', type: 'numeric', precision: 10, scale: 7, nullable: true })
  geofenceLat: string | null;

  @Column({ name: 'geofence_lng', type: 'numeric', precision: 10, scale: 7, nullable: true })
  geofenceLng: string | null;

  @Column({ name: 'geofence_radius_m', type: 'integer', nullable: true })
  geofenceRadiusM: number | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy: string | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
