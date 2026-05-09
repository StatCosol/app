import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('audit_schedules')
export class AuditScheduleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'audit_type', type: 'varchar', length: 30 })
  auditType: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'contractor_user_id', type: 'uuid', nullable: true })
  contractorUserId: string | null;

  @Column({ name: 'auditor_id', type: 'uuid' })
  auditorId: string;

  @Column({ name: 'scheduled_by_crm_id', type: 'uuid', nullable: true })
  scheduledByCrmId: string | null;

  @Column({ name: 'scheduled_by_system', type: 'boolean', default: false })
  scheduledBySystem: boolean;

  @Column({ name: 'schedule_date', type: 'date' })
  scheduleDate: Date;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  frequency: string | null;

  @Column({ type: 'varchar', length: 20, default: 'SCHEDULED' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
