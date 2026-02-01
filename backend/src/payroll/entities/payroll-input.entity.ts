import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('payroll_inputs')
@Index('idx_pi_client', ['clientId'])
@Index('idx_pi_branch', ['branchId'])
export class PayrollInputEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'client_id' })
  clientId: string;

  @Column({ type: 'uuid', name: 'branch_id', nullable: true })
  branchId: string | null;

  @Column({ type: 'int', name: 'period_year' })
  periodYear: number;

  @Column({ type: 'int', name: 'period_month' })
  periodMonth: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 30, default: 'SUBMITTED' })
  status: string;

  @Column({ type: 'uuid', name: 'submitted_by_user_id' })
  submittedByUserId: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
