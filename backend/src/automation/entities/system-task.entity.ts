import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TaskType =
  | 'COMPLIANCE'
  | 'AUDIT_NC'
  | 'RENEWAL'
  | 'REUPLOAD'
  | 'MONTHLY'
  | 'SAFETY';

export type TaskModule =
  | 'AUDIT'
  | 'COMPLIANCE'
  | 'RETURNS'
  | 'RENEWAL'
  | 'SAFETY'
  | 'PAYROLL';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type TaskStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'AWAITING_REUPLOAD'
  | 'REUPLOADED'
  | 'CLOSED'
  | 'CANCELLED';

@Entity('system_tasks')
export class SystemTaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_type', type: 'varchar', length: 50 })
  taskType: TaskType;

  @Column({ type: 'varchar', length: 30 })
  module: TaskModule;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId: string | null;

  @Column({
    name: 'reference_type',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  referenceType: string | null;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'contractor_id', type: 'uuid', nullable: true })
  contractorId: string | null;

  @Column({ name: 'assigned_role', type: 'varchar', length: 30 })
  assignedRole: string;

  @Column({ name: 'assigned_user_id', type: 'uuid', nullable: true })
  assignedUserId: string | null;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: Date | null;

  @Column({ type: 'varchar', length: 10, default: 'MEDIUM' })
  priority: TaskPriority;

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: TaskStatus;

  @Column({ name: 'created_by_system', type: 'boolean', default: true })
  createdBySystem: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
