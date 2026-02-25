import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'branch_registrations', schema: 'public' })
export class BranchRegistrationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'client_id' })
  clientId: string;

  @Column({ type: 'uuid', name: 'branch_id' })
  branchId: string;

  @Column({ type: 'varchar', length: 200 })
  type: string;

  @Column({ type: 'varchar', length: 100, name: 'registration_number', nullable: true })
  registrationNumber: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  authority: string | null;

  @Column({ type: 'date', name: 'issued_date', nullable: true })
  issuedDate: Date | null;

  @Column({ type: 'date', name: 'expiry_date', nullable: true })
  expiryDate: Date | null;

  @Column({ type: 'varchar', length: 30, default: 'ACTIVE' })
  status: string;

  @Column({ type: 'text', name: 'document_path', nullable: true })
  documentPath: string | null;

  @Column({ type: 'text', name: 'document_url', nullable: true })
  documentUrl: string | null;

  @Column({ type: 'text', name: 'renewal_document_url', nullable: true })
  renewalDocumentUrl: string | null;

  @Column({ type: 'timestamptz', name: 'renewed_on', nullable: true })
  renewedOn: Date | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
