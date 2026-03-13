import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'ai_payroll_anomalies' })
export class AiPayrollAnomalyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId: string | null;

  @Column({ name: 'payroll_run_id', type: 'uuid', nullable: true })
  payrollRunId: string | null;

  @Column({ name: 'anomaly_type', type: 'varchar', length: 100 })
  anomalyType: string;

  @Column({ type: 'varchar', length: 20, default: 'MEDIUM' })
  severity: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'jsonb', default: '{}' })
  details: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  recommendation: string | null;

  @Column({ type: 'varchar', length: 30, default: 'OPEN' })
  status: string;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true })
  resolutionNotes: string | null;

  @Column({ name: 'detected_at', type: 'timestamptz', default: () => 'NOW()' })
  detectedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
