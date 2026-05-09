import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('document_remarks')
export class DocumentRemark {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'bigint' })
  documentId: number;

  @Column({ name: 'document_type', type: 'varchar', length: 50 })
  documentType: string;

  @Column({ name: 'created_by_role', type: 'varchar', length: 20 })
  createdByRole: string;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @Column({ type: 'varchar', length: 30, default: 'INTERNAL' })
  visibility: string; // INTERNAL, CLIENT_VISIBLE, CONTRACTOR_VISIBLE, BOTH_VISIBLE

  @Column({ type: 'text' })
  text: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
