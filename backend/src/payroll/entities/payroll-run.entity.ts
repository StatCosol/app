import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'payroll_runs' })
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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
