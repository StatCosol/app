import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ComplianceMasterEntity } from '../../compliances/entities/compliance-master.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { BranchEntity } from '../../branches/entities/branch.entity';
import { ClientEntity } from '../../clients/entities/client.entity';

export type TaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'OVERDUE'
  | 'NOT_APPLICABLE';

@Entity('compliance_tasks')
@Index('IDX_CT_CLIENT_STATUS', ['clientId', 'status'])
@Index('IDX_CT_BRANCH_STATUS', ['branchId', 'status'])
@Index('IDX_CT_DUE_DATE', ['dueDate'])
@Index('IDX_CT_ASSIGNED_TO', ['assignedToUserId'])
@Index('IDX_CT_COMPLIANCE', ['complianceId'])
export class ComplianceTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => ClientEntity, { eager: false })
  @JoinColumn({ name: 'client_id' })
  client?: ClientEntity;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'compliance_id', type: 'uuid' })
  complianceId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'ONE_TIME'],
    enumName: 'frequency_enum',
  })
  frequency: string;

  @ManyToOne(() => ComplianceMasterEntity, { eager: false })
  @JoinColumn({ name: 'compliance_id' })
  compliance?: ComplianceMasterEntity;

  @ManyToOne(() => BranchEntity, { eager: false })
  @JoinColumn({ name: 'branch_id' })
  branch?: BranchEntity;

  @Column({ name: 'period_year', type: 'int' })
  periodYear: number;

  @Column({ name: 'period_month', type: 'int', nullable: true })
  periodMonth: number | null;

  @Column({ name: 'period_label', type: 'varchar', length: 30, nullable: true })
  periodLabel: string | null;

  @Column({ name: 'assigned_to_user_id', type: 'uuid', nullable: true })
  assignedToUserId: string | null;

  @ManyToOne(() => UserEntity, { eager: false })
  @JoinColumn({ name: 'assigned_to_user_id' })
  assignedTo?: UserEntity;

  @Column({ name: 'assigned_by_user_id', type: 'uuid' })
  assignedByUserId: string;

  @ManyToOne(() => UserEntity, { eager: false })
  @JoinColumn({ name: 'assigned_by_user_id' })
  assignedBy?: UserEntity;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string; // YYYY-MM-DD

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: TaskStatus;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId: string | null;

  @ManyToOne(() => UserEntity, { eager: false })
  @JoinColumn({ name: 'approved_by_user_id' })
  approvedBy?: UserEntity;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'last_notified_at', type: 'timestamp', nullable: true })
  lastNotifiedAt: Date | null;

  @Column({ name: 'escalated_at', type: 'timestamp', nullable: true })
  escalatedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
