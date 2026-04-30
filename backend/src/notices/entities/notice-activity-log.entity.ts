import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { NoticeEntity } from './notice.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('notice_activity_log')
export class NoticeActivityLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'notice_id', type: 'uuid' })
  noticeId: string;

  @ManyToOne(() => NoticeEntity, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notice_id' })
  notice?: NoticeEntity;

  @Column({ type: 'varchar', length: 50 })
  action: string;

  @Column({ name: 'from_status', type: 'varchar', length: 30, nullable: true })
  fromStatus: string | null;

  @Column({ name: 'to_status', type: 'varchar', length: 30, nullable: true })
  toStatus: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'action_by_user_id', type: 'uuid' })
  actionByUserId: string;

  @ManyToOne(() => UserEntity, { eager: false })
  @JoinColumn({ name: 'action_by_user_id' })
  actionBy?: UserEntity;

  @Column({ name: 'action_role', type: 'varchar', length: 30 })
  actionRole: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
