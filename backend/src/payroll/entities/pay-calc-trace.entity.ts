import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'pay_calc_traces' })
@Index(['runId', 'employeeId'], { unique: true })
export class PayCalcTraceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'run_id', type: 'uuid' })
  runId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'structure_id', type: 'uuid' })
  structureId: string;

  @Column({ name: 'rule_set_id', type: 'uuid' })
  ruleSetId: string;

  @Column({ name: 'trace', type: 'jsonb' })
  trace: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
