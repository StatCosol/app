import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'payroll_run_employees' })
@Index(['runId', 'employeeCode'], { unique: true })
export class PayrollRunEmployeeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'run_id', type: 'uuid' })
  runId: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Index()
  @Column({ name: 'employee_code', type: 'varchar', length: 50 })
  employeeCode: string;

  @Column({ name: 'employee_name', type: 'varchar', length: 200 })
  employeeName: string;

  @Column({ name: 'designation', type: 'varchar', length: 120, nullable: true })
  designation: string | null;

  @Column({ name: 'uan', type: 'varchar', length: 30, nullable: true })
  uan: string | null;

  @Column({ name: 'esic', type: 'varchar', length: 30, nullable: true })
  esic: string | null;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId: string | null;

  @Column({ name: 'state_code', type: 'varchar', length: 10, nullable: true })
  stateCode: string | null;

  @Column({ name: 'total_days', type: 'numeric', precision: 5, scale: 1, default: 0 })
  totalDays: number;

  @Column({ name: 'days_present', type: 'numeric', precision: 5, scale: 1, default: 0 })
  daysPresent: number;

  @Column({ name: 'lop_days', type: 'numeric', precision: 5, scale: 1, default: 0 })
  lopDays: number;

  @Column({ name: 'ncp_days', type: 'numeric', precision: 5, scale: 1, default: 0 })
  ncpDays: number;

  @Column({ name: 'ot_hours', type: 'numeric', precision: 6, scale: 2, default: 0 })
  otHours: number;

  @Column({
    name: 'gross_earnings',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  grossEarnings: string;

  @Column({
    name: 'total_deductions',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  totalDeductions: string;

  @Column({
    name: 'employer_cost',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  employerCost: string;

  @Column({
    name: 'net_pay',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  netPay: string;

  @Column({ name: 'pf_employee', type: 'numeric', precision: 14, scale: 2, nullable: true })
  pfEmployee: string | null;

  @Column({ name: 'esi_employee', type: 'numeric', precision: 14, scale: 2, nullable: true })
  esiEmployee: string | null;

  @Column({ name: 'pt', type: 'numeric', precision: 14, scale: 2, nullable: true })
  pt: string | null;

  @Column({ name: 'pf_employer', type: 'numeric', precision: 14, scale: 2, nullable: true })
  pfEmployer: string | null;

  @Column({ name: 'esi_employer', type: 'numeric', precision: 14, scale: 2, nullable: true })
  esiEmployer: string | null;

  @Column({ name: 'bonus', type: 'numeric', precision: 14, scale: 2, nullable: true })
  bonus: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
