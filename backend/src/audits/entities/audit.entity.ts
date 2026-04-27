import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ClientEntity } from '../../clients/entities/client.entity';
import { BranchEntity } from '../../branches/entities/branch.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { AuditType, Frequency } from '../../common/enums';

export type AuditStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'SUBMITTED'
  | 'CORRECTION_PENDING'
  | 'REVERIFICATION_PENDING'
  | 'CLOSED';

@Entity('audits')
export class AuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'audit_code',
    type: 'varchar',
    length: 20,
    nullable: true,
    unique: true,
  })
  auditCode: string | null;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => ClientEntity, { eager: false })
  @JoinColumn({ name: 'client_id' })
  client?: ClientEntity;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @ManyToOne(() => BranchEntity, { eager: false })
  @JoinColumn({ name: 'branch_id' })
  branch?: BranchEntity | null;

  @Column({ name: 'contractor_user_id', type: 'uuid', nullable: true })
  contractorUserId: string | null;

  @ManyToOne(() => UserEntity, { eager: false })
  @JoinColumn({ name: 'contractor_user_id' })
  contractorUser?: UserEntity | null;

  @Column({ type: 'enum', enum: Frequency })
  frequency: Frequency;

  @Column({ name: 'audit_type', type: 'enum', enum: AuditType })
  auditType: AuditType;

  @Column({ name: 'period_year', type: 'int' })
  periodYear: number;

  @Column({ name: 'period_code', type: 'varchar', length: 20 })
  periodCode: string; // e.g. 2025-01, 2025-Q1, 2025-H1, 2025

  @Column({ name: 'assigned_auditor_id', type: 'uuid' })
  assignedAuditorId: string;

  @ManyToOne(() => UserEntity, { eager: false })
  @JoinColumn({ name: 'assigned_auditor_id' })
  assignedAuditor?: UserEntity;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @ManyToOne(() => UserEntity, { eager: false })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy?: UserEntity;

  @Column({ type: 'varchar', length: 30, default: 'PLANNED' })
  status: AuditStatus;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  score: number | null; // Computed from observations (0-100)

  @Column({ name: 'score_calculated_at', type: 'timestamptz', nullable: true })
  scoreCalculatedAt: Date | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'final_remark', type: 'text', nullable: true })
  finalRemark: string | null;

  @Column({ name: 'scheduled_date', type: 'date', nullable: true })
  scheduledDate: string | null;

  @Column({ name: 'scheduled_by_user_id', type: 'uuid', nullable: true })
  scheduledByUserId: string | null;

  @ManyToOne(() => UserEntity, { eager: false })
  @JoinColumn({ name: 'scheduled_by_user_id' })
  scheduledBy?: UserEntity | null;

  /** Upload lock window: contractor cannot upload/reupload docs while today is between these dates (inclusive) */
  @Column({ name: 'upload_lock_from', type: 'date', nullable: true })
  uploadLockFrom: string | null;

  @Column({ name: 'upload_lock_until', type: 'date', nullable: true })
  uploadLockUntil: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
