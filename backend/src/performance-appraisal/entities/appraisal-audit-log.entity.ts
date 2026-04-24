import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EmployeeAppraisalEntity } from './employee-appraisal.entity';

@Entity({ name: 'appraisal_audit_logs' })
export class AppraisalAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'employee_appraisal_id', type: 'uuid' })
  employeeAppraisalId: string;

  @ManyToOne(() => EmployeeAppraisalEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_appraisal_id' })
  employeeAppraisal?: EmployeeAppraisalEntity;

  @Column({ name: 'action', type: 'varchar', length: 50 })
  action: string;

  @Column({ name: 'old_status', type: 'varchar', length: 30, nullable: true })
  oldStatus: string | null;

  @Column({ name: 'new_status', type: 'varchar', length: 30, nullable: true })
  newStatus: string | null;

  @Column({ name: 'changed_by', type: 'uuid' })
  changedBy: string;

  @Column({ name: 'changed_at', type: 'timestamptz', default: () => 'now()' })
  changedAt: Date;

  @Column({ name: 'payload', type: 'jsonb', nullable: true })
  payload: any;
}
