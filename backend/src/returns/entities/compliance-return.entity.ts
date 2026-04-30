import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClientEntity } from '../../clients/entities/client.entity';
import { BranchEntity } from '../../branches/entities/branch.entity';

export type ReturnStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'NOT_APPLICABLE';

@Entity({ name: 'compliance_returns' })
@Index(['clientId', 'branchId', 'periodYear', 'periodMonth'])
export class ComplianceReturnEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId!: string;

  @ManyToOne(() => ClientEntity, { eager: false })
  @JoinColumn({ name: 'client_id' })
  client?: ClientEntity;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId!: string | null;

  @ManyToOne(() => BranchEntity, { eager: false })
  @JoinColumn({ name: 'branch_id' })
  branch?: BranchEntity;

  @Column({ name: 'law_type', type: 'varchar', length: 50 })
  lawType!: string;

  @Column({ name: 'return_type', type: 'varchar', length: 120 })
  returnType!: string;

  @Column({ name: 'period_year', type: 'int' })
  periodYear!: number;

  @Column({ name: 'period_month', type: 'int', nullable: true })
  periodMonth!: number | null;

  @Column({
    name: 'period_label',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  periodLabel!: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate!: string | null;

  @Column({ name: 'filed_date', type: 'date', nullable: true })
  filedDate!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'PENDING' })
  status!: ReturnStatus;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted!: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy!: string | null;

  @Column({ name: 'delete_reason', type: 'text', nullable: true })
  deleteReason!: string | null;

  @Column({ name: 'filed_by_user_id', type: 'uuid', nullable: true })
  filedByUserId!: string | null;

  @Column({ name: 'ack_number', type: 'varchar', length: 100, nullable: true })
  ackNumber!: string | null;

  @Column({ name: 'ack_file_path', type: 'text', nullable: true })
  ackFilePath!: string | null;

  @Column({ name: 'challan_file_path', type: 'text', nullable: true })
  challanFilePath!: string | null;

  @Column({
    name: 'created_by_role',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  createdByRole!: string | null;

  @Column({ name: 'crm_owner', type: 'varchar', length: 150, nullable: true })
  crmOwner!: string | null;

  @Column({ name: 'status_change_reason', type: 'text', nullable: true })
  statusChangeReason!: string | null;

  @Column({ name: 'crm_last_reminder_at', type: 'timestamptz', nullable: true })
  crmLastReminderAt!: Date | null;

  @Column({ name: 'crm_last_note', type: 'text', nullable: true })
  crmLastNote!: string | null;

  @Column({ name: 'crm_last_note_at', type: 'timestamptz', nullable: true })
  crmLastNoteAt!: Date | null;

  @Column({
    name: 'uploaded_by_role',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  uploadedByRole!: string | null;

  @Column({ name: 'acting_on_behalf', type: 'boolean', default: false })
  actingOnBehalf!: boolean;

  @Column({
    name: 'original_owner_role',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  originalOwnerRole!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
