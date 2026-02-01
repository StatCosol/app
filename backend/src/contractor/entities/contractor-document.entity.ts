import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';

/**
 * NOTE: In DB the column is named contractor_id, but it represents the contractor user's id (users.id).
 * We keep the property name contractorId for minimal impact on existing code.
 */
@Entity('contractor_documents')
@Index('idx_cd_contractor_id', ['contractorId'])
@Index('idx_cd_client_id', ['clientId'])
@Index('idx_cd_branch_id', ['branchId'])
@Index('idx_cd_audit_id', ['auditId'])
@Index('idx_cd_observation_id', ['observationId'])
@Index('idx_cd_uploaded_by_user_id', ['uploadedByUserId'])
@Index('idx_cd_created_at', ['createdAt'])
export class ContractorDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // users.id (contractor)
  @Column({ name: 'contractor_id', type: 'uuid' })
  contractorId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'contractor_id' })
  contractor?: UserEntity;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @Column({ name: 'doc_type', type: 'varchar', length: 255 })
  docType: string;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'audit_id', type: 'uuid', nullable: true })
  auditId: string | null;

  @Column({ name: 'observation_id', type: 'uuid', nullable: true })
  observationId: string | null;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'file_path', type: 'text' })
  filePath: string;

  @Column({ name: 'file_type', type: 'varchar', length: 100, nullable: true })
  fileType: string | null;

  @Column({ name: 'file_size', type: 'bigint', nullable: true })
  fileSize: string | null;

  // users.id (who uploaded) — can be contractor, CRM, admin, etc.
  @Column({ name: 'uploaded_by_user_id', type: 'uuid' })
  uploadedByUserId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedBy?: UserEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
