import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity('user_login_logs')
export class UserLoginLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_ull_user_id')
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 180 })
  email: string;

  @Column({ type: 'varchar', length: 50, name: 'role_code' })
  roleCode: string;

  @Column({ type: 'uuid', name: 'client_id', nullable: true })
  clientId: string | null;

  @Column({ type: 'varchar', length: 45, name: 'ip_address', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'text', name: 'user_agent', nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 15, default: 'SUCCESS' })
  status: 'SUCCESS' | 'FAILED';

  @Column({
    type: 'varchar',
    length: 80,
    name: 'failure_reason',
    nullable: true,
  })
  failureReason: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'logged_in_at' })
  loggedInAt: Date;
}
