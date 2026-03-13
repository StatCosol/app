import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'leave_policies' })
@Index(['clientId', 'leaveType'])
export class LeavePolicyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'leave_type', type: 'varchar', length: 30 })
  leaveType: string;

  @Column({ name: 'leave_name', type: 'varchar', length: 100 })
  leaveName: string;

  @Column({
    name: 'accrual_method',
    type: 'varchar',
    length: 20,
    default: 'MONTHLY',
  })
  accrualMethod: string;

  @Column({
    name: 'accrual_rate',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  accrualRate: string;

  @Column({
    name: 'carry_forward_limit',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  carryForwardLimit: string;

  @Column({
    name: 'yearly_limit',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  yearlyLimit: string;

  @Column({ name: 'allow_negative', type: 'boolean', default: false })
  allowNegative: boolean;

  @Column({ name: 'min_notice_days', type: 'int', default: 0 })
  minNoticeDays: number;

  @Column({
    name: 'max_days_per_request',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  maxDaysPerRequest: string;

  @Column({ name: 'requires_document', type: 'boolean', default: false })
  requiresDocument: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
