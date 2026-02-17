import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('document_reupload_requests')
export class DocumentReuploadRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'bigint' })
  documentId: number;

  @Column({ name: 'document_type', type: 'varchar', length: 50 })
  documentType: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'unit_id', type: 'uuid', nullable: true })
  unitId: string | null;

  @Column({ name: 'contractor_id', type: 'uuid', nullable: true })
  contractorId: string | null;

  @Column({ name: 'target_role', type: 'varchar', length: 20 })
  targetRole: string; // CLIENT, CONTRACTOR

  @Column({ name: 'requested_by_role', type: 'varchar', length: 20 })
  requestedByRole: string; // AUDITOR, CRM

  @Column({ name: 'requested_by_user_id', type: 'uuid' })
  requestedByUserId: string;

  @Column({ type: 'varchar', length: 200 })
  reason: string;

  @Column({ name: 'remarks_visible', type: 'text' })
  remarksVisible: string;

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: string; // OPEN, SUBMITTED, REVERIFIED, REJECTED, CLOSED

  @Column({ name: 'deadline_date', type: 'date', nullable: true })
  deadlineDate: Date | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'reverified_at', type: 'timestamptz', nullable: true })
  reverifiedAt: Date | null;

  @Column({ name: 'reverified_by_user_id', type: 'uuid', nullable: true })
  reverifiedByUserId: string | null;

  @Column({ name: 'crm_remarks', type: 'text', nullable: true })
  crmRemarks: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
