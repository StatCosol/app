import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EmployeeAppraisalEntity } from './employee-appraisal.entity';

@Entity({ name: 'appraisal_approvals' })
export class AppraisalApprovalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'employee_appraisal_id', type: 'uuid' })
  employeeAppraisalId: string;

  @ManyToOne(() => EmployeeAppraisalEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_appraisal_id' })
  employeeAppraisal?: EmployeeAppraisalEntity;

  @Column({ name: 'approval_level', type: 'varchar', length: 30 })
  approvalLevel: string;

  @Column({ name: 'approver_id', type: 'uuid' })
  approverId: string;

  @Column({ name: 'action', type: 'varchar', length: 30 })
  action: string;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'action_at', type: 'timestamptz', default: () => 'now()' })
  actionAt: Date;
}
