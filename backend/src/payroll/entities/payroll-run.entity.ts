import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'payroll_runs' })
@Index(['clientId', 'branchId', 'periodYear', 'periodMonth'], { unique: true })
@Index('IDX_PR_CLIENT_STATUS', ['clientId', 'status'])
@Index('IDX_PR_CLIENT_PERIOD', ['clientId', 'periodYear', 'periodMonth'])
@Index('IDX_PR_BRANCH_PERIOD', ['branchId', 'periodYear', 'periodMonth'])
@Index('IDX_PR_STATUS', ['status'])
export class PayrollRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Index()
  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Index()
  @Column({ name: 'period_year', type: 'int' })
  periodYear: number;

  @Index()
  @Column({ name: 'period_month', type: 'int' })
  periodMonth: number;

  @Index()
  @Column({ name: 'status', type: 'varchar', length: 30, default: 'DRAFT' })
  status: string;

  // Optional linkage to uploaded payroll input (if you keep payroll_inputs)
  @Index()
  @Column({ name: 'source_payroll_input_id', type: 'uuid', nullable: true })
  sourcePayrollInputId: string | null;

  @Column({ name: 'title', type: 'varchar', length: 200, nullable: true })
  title: string | null;

  // ── Approval workflow fields ───────────────────────────
  @Column({ name: 'submitted_by_user_id', type: 'uuid', nullable: true })
  submittedByUserId: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'approval_comments', type: 'text', nullable: true })
  approvalComments: string | null;

  @Column({ name: 'rejected_by_user_id', type: 'uuid', nullable: true })
  rejectedByUserId: string | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
