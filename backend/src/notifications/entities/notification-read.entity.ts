import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { NotificationEntity } from './notification.entity';
import { UserEntity } from '../../users/entities/user.entity';

/**
 * Legacy-compatible read receipt table.
 * See migrations/20260201_notification_reads.sql
 */
@Entity({ name: 'notification_reads' })
@Unique('uq_notification_reads_notification_user', ['notificationId', 'userId'])
@Index('idx_notification_reads_user', ['userId'])
@Index('idx_notification_reads_notification', ['notificationId'])
export class NotificationReadEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'notification_id', type: 'uuid' })
  notificationId: string;

  @ManyToOne(() => NotificationEntity, (t) => t.reads, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notification_id' })
  thread?: NotificationEntity;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'last_read_at', type: 'timestamptz', default: () => 'now()' })
  lastReadAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
