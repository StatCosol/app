import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'payroll_fnf' })
export class PayrollFnfEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'separation_date', type: 'date' })
  separationDate: string;

  @Column({ name: 'last_working_day', type: 'date', nullable: true })
  lastWorkingDay: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 30, default: 'INITIATED' })
  status: string;

  @Column({ type: 'jsonb', default: '[]' })
  checklist: any;

  @Column({
    name: 'settlement_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  settlementAmount: number | null;

  @Column({ name: 'settlement_breakup', type: 'jsonb', nullable: true })
  settlementBreakup: any;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'initiated_by', type: 'uuid', nullable: true })
  initiatedBy: string | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
