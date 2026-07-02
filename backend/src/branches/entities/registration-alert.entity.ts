import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'registration_alerts', schema: 'public' })
export class RegistrationAlertEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'registration_id' })
  registrationId: string;

  @Column({ type: 'uuid', name: 'client_id' })
  clientId: string;

  @Column({ type: 'uuid', name: 'branch_id' })
  branchId: string;

  @Column({ type: 'varchar', length: 30, name: 'alert_type' })
  alertType: string; // '60_DAY', '30_DAY', '7_DAY', 'EXPIRED'

  @Column({ type: 'varchar', length: 10, default: 'LOW' })
  priority: string; // LOW, MEDIUM, HIGH, CRITICAL

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 30, default: 'REGISTRATION' })
  module: string;

  @Column({ type: 'boolean', name: 'is_read', default: false })
  isRead: boolean;

  @Column({ type: 'boolean', default: false })
  emailed: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
