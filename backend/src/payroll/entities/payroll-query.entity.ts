import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'payroll_queries' })
export class PayrollQueryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId: string | null;

  @Column({ name: 'raised_by', type: 'uuid' })
  raisedBy: string;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo: string | null;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'varchar', length: 50, default: 'GENERAL' })
  category: string;

  @Column({ type: 'varchar', length: 20, default: 'MEDIUM' })
  priority: string;

  @Column({ type: 'varchar', length: 30, default: 'OPEN' })
  status: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
