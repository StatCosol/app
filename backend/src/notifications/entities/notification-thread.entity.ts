import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';
import { ClientEntity } from '../../clients/entities/client.entity';
import { BranchEntity } from '../../branches/entities/branch.entity';

export type NotificationQueryType = 'TECHNICAL' | 'COMPLIANCE' | 'AUDIT';
export type NotificationStatus = 'OPEN' | 'CLOSED';

@Entity('notification_threads')
export class NotificationThread {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  @ManyToOne(() => ClientEntity, { nullable: true })
  @JoinColumn({ name: 'client_id' })
  client: ClientEntity | null;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @ManyToOne(() => BranchEntity, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  branch: BranchEntity | null;

  @Column({ name: 'query_type', type: 'varchar', length: 20 })
  queryType: NotificationQueryType;

  @Column({ name: 'subject', type: 'varchar', length: 200, nullable: true })
  subject: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser: UserEntity;

  @Column({ name: 'assigned_to_user_id', type: 'uuid' })
  assignedToUserId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'assigned_to_user_id' })
  assignedToUser: UserEntity;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'OPEN' })
  status: NotificationStatus;

  @Column({ name: 'routed_to', type: 'varchar', length: 20, nullable: true })
  routedTo: string | null;

  @Column({
    name: 'routing_warning',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  routingWarning: string | null;

  @Column({ name: 'thread_key', type: 'varchar', length: 80, nullable: true })
  threadKey: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
