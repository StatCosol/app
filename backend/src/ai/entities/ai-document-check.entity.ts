import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AiRequestEntity } from './ai-request.entity';

export type DocCheckResult = 'PASS' | 'WARN' | 'FAIL' | 'PENDING';

@Entity({ name: 'ai_document_checks' })
export class AiDocumentCheckEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', type: 'uuid', nullable: true })
  documentId: string | null;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({
    name: 'document_type',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  documentType: string | null;

  @Column({
    name: 'document_name',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  documentName: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  issues: any[];

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  result: DocCheckResult;

  @Column({ name: 'suggested_fix', type: 'jsonb', default: '[]' })
  suggestedFix: any[];

  @Column({ name: 'ai_request_id', type: 'uuid', nullable: true })
  aiRequestId: string | null;

  @ManyToOne(() => AiRequestEntity, { eager: false, nullable: true })
  @JoinColumn({ name: 'ai_request_id' })
  aiRequest?: AiRequestEntity | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
