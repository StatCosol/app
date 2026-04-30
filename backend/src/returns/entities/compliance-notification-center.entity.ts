import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('compliance_notification_center')
export class ComplianceNotificationCenterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid', { nullable: true })
  clientId: string | null;

  @Column('uuid', { nullable: true })
  branchId: string | null;

  @Column({ length: 30 })
  role: string;

  @Column({ length: 50 })
  module: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ length: 20, default: 'OPEN' })
  status: string;

  @Column({ length: 20, default: 'MEDIUM' })
  priority: string;

  @Column('uuid', { nullable: true })
  entityId: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  entityType: string | null;

  @Column({ type: 'date', nullable: true })
  dueDate: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
