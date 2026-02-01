import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';
import { ClientEntity } from '../../clients/entities/client.entity';
import { BranchEntity } from '../../branches/entities/branch.entity';
import { NotificationMessageEntity } from './notification-message.entity';
import { NotificationReadEntity } from './notification-read.entity';

/**
 * Maps to legacy DB table used by StatCo schema: notification_threads
 *
 * We keep API responses in the newer "notifications" shape via the service layer.
 */
@Entity({ name: 'notification_threads' })
@Index('idx_notification_threads_to', ['toUserId'])
@Index('idx_notification_threads_status', ['status'])
@Index('idx_notification_threads_query_type', ['queryType'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // In schema: title is required
  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'query_type', type: 'varchar', length: 50 })
  queryType: string;

  @Column({ name: 'priority', type: 'varchar', length: 20, default: 'NORMAL' })
  priority: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'OPEN' })
  status: string;

  // Creator (from_user_id)
  @Column({ name: 'from_user_id', type: 'uuid' })
  fromUserId: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'from_user_id' })
  fromUser?: UserEntity;

  // Assignee (to_user_id)
  @Column({ name: 'to_user_id', type: 'uuid' })
  toUserId: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'to_user_id' })
  toUser?: UserEntity;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  @ManyToOne(() => ClientEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'client_id' })
  client?: ClientEntity | null;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @ManyToOne(() => BranchEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branch_id' })
  branch?: BranchEntity | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => NotificationMessageEntity, (m) => m.thread)
  messages?: NotificationMessageEntity[];

  @OneToMany(() => NotificationReadEntity, (r) => r.thread)
  reads?: NotificationReadEntity[];
}
