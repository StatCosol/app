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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
