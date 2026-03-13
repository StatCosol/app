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
 * Maps to DB table: notifications
 */
@Entity({ name: 'notifications' })
@Index('IDX_NOTIF_CLIENT', ['clientId'])
@Index('IDX_NOTIF_BRANCH', ['branchId'])
@Index('IDX_NOTIF_CREATED_BY', ['createdByUserId'])
@Index('IDX_NOTIF_ASSIGNED_TO', ['assignedToUserId'])
@Index('IDX_NOTIF_STATUS', ['status'])
@Index('IDX_NOTIF_PRIORITY', ['priority'])
@Index('IDX_NOTIF_QUERY_TYPE', ['queryType'])
@Index('IDX_NOTIF_CREATED_AT', ['createdAt'])
@Index('IDX_NOTIF_CLIENT_STATUS', ['clientId', 'status'])
@Index('IDX_NOTIF_ASSIGNED_STATUS', ['assignedToUserId', 'status'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser?: UserEntity;

  @Column({ name: 'created_by_role', type: 'varchar', length: 30 })
  createdByRole: string;

  @Column({ name: 'query_type', type: 'varchar', length: 30 })
  queryType: string;

  @Column({ name: 'subject', type: 'text' })
  subject: string;

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

  @Column({ name: 'status', type: 'varchar', length: 30, default: 'OPEN' })
  status: string;

  @Column({ name: 'priority', type: 'smallint', default: 2 })
  priority: number;

  @Column({ name: 'assigned_to_user_id', type: 'uuid', nullable: true })
  assignedToUserId: string | null;

  @Column({
    name: 'assigned_to_role',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  assignedToRole: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_to_user_id' })
  assignedToUser?: UserEntity | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @Column({ name: 'is_archived', type: 'boolean', default: false })
  isArchived: boolean;

  @Column({ name: 'source_key', type: 'text', nullable: true })
  sourceKey: string | null;

  @OneToMany(() => NotificationMessageEntity, (m) => m.notification)
  messages?: NotificationMessageEntity[];

  @OneToMany(() => NotificationReadEntity, (r) => r.notification)
  reads?: NotificationReadEntity[];
}
