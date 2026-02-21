import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'payroll_run_items' })
@Index(['runEmployeeId', 'componentCode'], { unique: true })
export class PayrollRunItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'run_id', type: 'uuid' })
  runId: string;

  @Index()
  @Column({ name: 'run_employee_id', type: 'uuid' })
  runEmployeeId: string;

  @Index()
  @Column({ name: 'component_code', type: 'varchar', length: 60 })
  componentCode: string;

  @Column({
    name: 'amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  amount: string;

  @Column({
    name: 'units',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  units: string | null;

  @Column({
    name: 'rate',
    type: 'numeric',
    precision: 14,
    scale: 4,
    nullable: true,
  })
  rate: string | null;

  @Column({ name: 'source', type: 'varchar', length: 20, default: 'UPLOADED' })
  source: 'UPLOADED' | 'CALCULATED' | 'OVERRIDE';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
