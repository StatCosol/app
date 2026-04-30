import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('contractor_required_documents')
@Index('idx_crd_contractor', ['contractorUserId'])
@Index('idx_crd_client', ['clientId'])
@Index('idx_crd_branch', ['branchId'])
@Index('idx_crd_doc_type', ['docType'])
export class ContractorRequiredDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'contractor_user_id', type: 'uuid' })
  contractorUserId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'doc_type', type: 'varchar', length: 255 })
  docType: string;

  @Column({ name: 'is_required', type: 'boolean', default: true })
  isRequired: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
