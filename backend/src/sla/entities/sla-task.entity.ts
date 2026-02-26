import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('sla_tasks')
export class SlaTaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'module', type: 'varchar', length: 30 })
  module: string; // REGISTRATION/MCD/RETURNS/AUDIT

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ name: 'source_key', type: 'text', nullable: true })
  sourceKey: string | null;

  @Column({ name: 'title', type: 'text' })
  title: string;

  @Column({ name: 'priority', type: 'varchar', length: 15, default: 'MEDIUM' })
  priority: string; // LOW/MEDIUM/HIGH/CRITICAL

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({ name: 'assigned_to_user_id', type: 'uuid', nullable: true })
  assignedToUserId: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'OPEN' })
  status: string; // OPEN/IN_PROGRESS/CLOSED/OVERDUE

  @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;
}
