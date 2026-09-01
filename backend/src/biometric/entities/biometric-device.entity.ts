import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'biometric_devices' })
@Index(['clientId'])
export class BiometricDeviceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Index({ unique: true })
  @Column({ name: 'serial_number', type: 'varchar', length: 80 })
  serialNumber: string;

  @Column({ name: 'push_token', type: 'varchar', length: 120 })
  pushToken: string;

  /**
   * Optional narrowing for a machine that serves a single contractor. Left
   * null on a shared machine — one unit normally enrols on-roll staff and
   * every contractor's workers together, and the punched code alone decides
   * who a punch belongs to.
   */
  @Column({ name: 'contractor_user_id', type: 'uuid', nullable: true })
  contractorUserId: string | null;

  @Column({ type: 'varchar', length: 40, default: 'ESSL' })
  vendor: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  model: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  label: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @Column({ name: 'last_push_count', type: 'integer', default: 0 })
  lastPushCount: number;

  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
