import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'employee_documents' })
@Index(['clientId', 'employeeId'])
export class EmployeeDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Index()
  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'doc_type', type: 'varchar', length: 80 })
  docType: string; // AADHAAR, PAN, PASSPORT, OFFER_LETTER, etc.

  @Column({ name: 'doc_name', type: 'varchar', length: 255 })
  docName: string;

  @Column({ name: 'file_name', type: 'varchar', length: 500 })
  fileName: string;

  @Column({ name: 'file_path', type: 'varchar', length: 1000 })
  filePath: string;

  @Column({ name: 'file_size', type: 'int', default: 0 })
  fileSize: number;

  @Column({ name: 'mime_type', type: 'varchar', length: 100, nullable: true })
  mimeType: string | null;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid' })
  uploadedByUserId: string;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ name: 'verified_by_user_id', type: 'uuid', nullable: true })
  verifiedByUserId: string | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
