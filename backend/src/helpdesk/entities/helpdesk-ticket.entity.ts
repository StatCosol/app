import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('helpdesk_tickets')
@Index('idx_ht_client', ['clientId'])
@Index('idx_ht_status', ['status'])
export class HelpdeskTicketEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40 })
  category: string;

  @Column({ type: 'varchar', length: 80, name: 'sub_category', nullable: true })
  subCategory: string | null;

  @Column({ type: 'uuid', name: 'client_id' })
  clientId: string;

  @Column({ type: 'uuid', name: 'branch_id', nullable: true })
  branchId: string | null;

  @Column({ type: 'varchar', length: 80, name: 'employee_ref', nullable: true })
  employeeRef: string | null;

  @Column({ type: 'varchar', length: 20, default: 'NORMAL' })
  priority: string;

  @Column({ type: 'varchar', length: 30, default: 'OPEN' })
  status: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'uuid', name: 'created_by_user_id' })
  createdByUserId: string;

  @Column({ type: 'uuid', name: 'assigned_to_user_id', nullable: true })
  assignedToUserId: string | null;

  @Column({ type: 'timestamptz', name: 'sla_due_at', nullable: true })
  slaDueAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
