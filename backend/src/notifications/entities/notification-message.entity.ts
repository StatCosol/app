import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { NotificationEntity } from './notification.entity';
import { UserEntity } from '../../users/entities/user.entity';

/**
 * Legacy table: notification_messages
 *  - id: bigserial
 *  - thread_id: uuid
 */
@Entity({ name: 'notification_messages' })
@Index('idx_notification_messages_thread_created', ['threadId', 'createdAt'])
export class NotificationMessageEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'thread_id', type: 'uuid' })
  threadId: string;

  @ManyToOne(() => NotificationEntity, (t) => t.messages, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'thread_id' })
  thread?: NotificationEntity;

  @Column({ name: 'sender_user_id', type: 'uuid' })
  senderUserId: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_user_id' })
  senderUser?: UserEntity;

  @Column({ name: 'message', type: 'text' })
  message: string;

  @Column({ name: 'attachment_path', type: 'text', nullable: true })
  attachmentPath: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
