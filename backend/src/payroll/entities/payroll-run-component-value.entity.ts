import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'payroll_run_component_values' })
@Index(['runEmployeeId', 'componentCode'], { unique: true })
export class PayrollRunComponentValueEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'run_id', type: 'uuid' })
  runId: string;

  @Index()
  @Column({ name: 'run_employee_id', type: 'uuid' })
  runEmployeeId: string;

  @Column({ name: 'component_code', type: 'varchar', length: 60 })
  componentCode: string;

  @Column({ name: 'amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  amount: string;

  @Column({ name: 'source', type: 'varchar', length: 20, default: 'UPLOADED' })
  source: 'UPLOADED' | 'CALCULATED' | 'OVERRIDE';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
