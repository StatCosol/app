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
 * Table: notification_messages
 *  - id: bigserial (bigint)
 *  - notification_id: uuid (FK -> notifications.id)
 */
@Entity({ name: 'notification_messages' })
@Index('idx_notification_messages_notification_created', [
  'notificationId',
  'createdAt',
])
export class NotificationMessageEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'notification_id', type: 'uuid' })
  notificationId: string;

  @ManyToOne(() => NotificationEntity, (t) => t.messages, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'notification_id' })
  notification?: NotificationEntity;

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
