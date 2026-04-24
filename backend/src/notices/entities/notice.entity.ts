import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ClientEntity } from '../../clients/entities/client.entity';
import { BranchEntity } from '../../branches/entities/branch.entity';
import { UserEntity } from '../../users/entities/user.entity';

export type NoticeStatus =
  | 'RECEIVED'
  | 'UNDER_REVIEW'
  | 'ACTION_REQUIRED'
  | 'RESPONSE_DRAFTED'
  | 'RESPONSE_SUBMITTED'
  | 'CLOSED'
  | 'ESCALATED';

export type NoticeSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type NoticeType =
  | 'SHOW_CAUSE'
  | 'DEMAND'
  | 'INSPECTION'
  | 'PENALTY'
  | 'GENERAL'
  | 'PROSECUTION'
  | 'OTHER';

@Entity('notices')
@Index('IDX_NOTICE_CLIENT', ['clientId'])
@Index('IDX_NOTICE_BRANCH', ['branchId'])
@Index('IDX_NOTICE_STATUS', ['status'])
@Index('IDX_NOTICE_DUE', ['responseDueDate'])
export class NoticeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'notice_code', type: 'varchar', length: 30, unique: true })
  noticeCode: string;

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

  @Column({ name: 'notice_type', type: 'varchar', length: 30, default: 'GENERAL' })
  noticeType: NoticeType;

  @Column({ name: 'department_name', type: 'varchar', length: 150 })
  departmentName: string;

  @Column({ name: 'reference_no', type: 'varchar', length: 100, nullable: true })
  referenceNo: string | null;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'notice_date', type: 'date' })
  noticeDate: string;

  @Column({ name: 'received_date', type: 'date' })
  receivedDate: string;

  @Column({ name: 'response_due_date', type: 'date', nullable: true })
  responseDueDate: string | null;

  @Column({ type: 'varchar', length: 30, default: 'MEDIUM' })
  severity: NoticeSeverity;

  @Column({ type: 'varchar', length: 30, default: 'RECEIVED' })
  status: NoticeStatus;

  @Column({ name: 'assigned_to_user_id', type: 'uuid', nullable: true })
  assignedToUserId: string | null;

  @ManyToOne(() => UserEntity, { eager: false })
  @JoinColumn({ name: 'assigned_to_user_id' })
  assignedTo?: UserEntity | null;

  @Column({ name: 'linked_compliance_instance_id', type: 'uuid', nullable: true })
  linkedComplianceInstanceId: string | null;

  @Column({ name: 'response_summary', type: 'text', nullable: true })
  responseSummary: string | null;

  @Column({ name: 'response_date', type: 'date', nullable: true })
  responseDate: string | null;

  @Column({ name: 'closure_remarks', type: 'text', nullable: true })
  closureRemarks: string | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'closed_by_user_id', type: 'uuid', nullable: true })
  closedByUserId: string | null;

  @ManyToOne(() => UserEntity, { eager: false })
  @JoinColumn({ name: 'closed_by_user_id' })
  closedBy?: UserEntity | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @ManyToOne(() => UserEntity, { eager: false })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy?: UserEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
