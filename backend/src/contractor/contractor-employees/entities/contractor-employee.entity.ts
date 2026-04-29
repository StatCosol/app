import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'contractor_employees' })
@Index('IDX_CE_CLIENT_BRANCH', ['clientId', 'branchId'])
@Index('IDX_CE_CONTRACTOR', ['contractorUserId'])
@Index('IDX_CE_ACTIVE', ['isActive'])
export class ContractorEmployeeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @Column({ name: 'contractor_user_id', type: 'uuid' })
  contractorUserId: string;

  @Column({ name: 'name', type: 'varchar', length: 250 })
  name: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ name: 'gender', type: 'varchar', length: 10, nullable: true })
  gender: string | null;

  @Column({ name: 'father_name', type: 'varchar', length: 200, nullable: true })
  fatherName: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ name: 'email', type: 'varchar', length: 200, nullable: true })
  email: string | null;

  @Column({ name: 'aadhaar', type: 'varchar', length: 20, nullable: true })
  aadhaar: string | null;

  @Column({ name: 'pan', type: 'varchar', length: 20, nullable: true })
  pan: string | null;

  @Column({ name: 'uan', type: 'varchar', length: 30, nullable: true })
  uan: string | null;

  @Column({ name: 'esic', type: 'varchar', length: 30, nullable: true })
  esic: string | null;

  @Column({ name: 'pf_applicable', type: 'boolean', default: false })
  pfApplicable: boolean;

  @Column({ name: 'esi_applicable', type: 'boolean', default: false })
  esiApplicable: boolean;

  @Column({ name: 'designation', type: 'varchar', length: 120, nullable: true })
  designation: string | null;

  @Column({ name: 'department', type: 'varchar', length: 120, nullable: true })
  department: string | null;

  @Column({ name: 'date_of_joining', type: 'date', nullable: true })
  dateOfJoining: string | null;

  @Column({ name: 'date_of_exit', type: 'date', nullable: true })
  dateOfExit: string | null;

  @Column({ name: 'exit_reason', type: 'varchar', length: 500, nullable: true })
  exitReason: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** Worker employment lifecycle: ACTIVE | LEFT | INACTIVE. Replaces is_active for state semantics. */
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'ACTIVE' })
  status: 'ACTIVE' | 'LEFT' | 'INACTIVE';

  /** Statutory skill category (Minimum Wages Act). */
  @Column({
    name: 'skill_category',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  skillCategory:
    | 'UNSKILLED'
    | 'SEMI_SKILLED'
    | 'SKILLED'
    | 'HIGHLY_SKILLED'
    | null;

  @Column({
    name: 'monthly_salary',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null | undefined) => (v == null ? null : v),
      from: (v: string | null) => (v == null ? null : Number(v)),
    },
  })
  monthlySalary: number | null;

  @Column({
    name: 'daily_wage',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null | undefined) => (v == null ? null : v),
      from: (v: string | null) => (v == null ? null : Number(v)),
    },
  })
  dailyWage: number | null;

  /** State code for minimum-wage lookup (Phase 2). */
  @Column({ name: 'state_code', type: 'varchar', length: 10, nullable: true })
  stateCode: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
