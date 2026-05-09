import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'pay_salary_structures' })
@Index(['clientId', 'scopeType', 'effectiveFrom'])
export class PaySalaryStructureEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'name', type: 'varchar', length: 180 })
  name: string;

  @Column({ name: 'scope_type', type: 'varchar', length: 30 })
  scopeType: 'TENANT' | 'BRANCH' | 'DEPARTMENT' | 'GRADE' | 'EMPLOYEE';

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @Column({ name: 'grade_id', type: 'uuid', nullable: true })
  gradeId: string | null;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId: string | null;

  @Column({ name: 'rule_set_id', type: 'uuid' })
  ruleSetId: string;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  // ── Approval workflow (Phase 2B) ────────────────────────────────────
  // DRAFT  → editor working on it
  // PENDING → submitted, awaiting approval
  // APPROVED → eligible to be activated and consumed by the engine
  // REJECTED → reviewer rejected; editor can re-submit after fixes
  @Column({
    name: 'approval_status',
    type: 'varchar',
    length: 20,
    default: 'DRAFT',
  })
  approvalStatus: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

  @Column({ name: 'submitted_by_id', type: 'uuid', nullable: true })
  submittedById: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'approved_by_id', type: 'uuid', nullable: true })
  approvedById: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'rejected_by_id', type: 'uuid', nullable: true })
  rejectedById: string | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
