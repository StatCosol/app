import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ name: 'ai_document_analyses' })
export class AiDocumentAnalysisEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'document_type', type: 'varchar', length: 100, nullable: true })
  documentType: string | null;

  @Column({ name: 'file_name', type: 'varchar', length: 500, nullable: true })
  fileName: string | null;

  @Column({ name: 'file_url', type: 'text', nullable: true })
  fileUrl: string | null;

  @Column({ name: 'analysis_result', type: 'jsonb', default: '{}' })
  analysisResult: Record<string, any>;

  @Column({ name: 'issues_found', type: 'int', default: 0 })
  issuesFound: number;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;

  @Column({ name: 'days_until_expiry', type: 'int', nullable: true })
  daysUntilExpiry: number | null;

  @Column({ name: 'amount_expected', type: 'numeric', precision: 14, scale: 2, nullable: true })
  amountExpected: number | null;

  @Column({ name: 'amount_found', type: 'numeric', precision: 14, scale: 2, nullable: true })
  amountFound: number | null;

  @Column({ name: 'headcount_expected', type: 'int', nullable: true })
  headcountExpected: number | null;

  @Column({ name: 'headcount_found', type: 'int', nullable: true })
  headcountFound: number | null;

  @Column({ name: 'ai_model', type: 'varchar', length: 100, nullable: true })
  aiModel: string | null;

  @Column({ name: 'confidence_score', type: 'numeric', precision: 5, scale: 2, nullable: true })
  confidenceScore: number | null;

  @Column({ type: 'varchar', length: 30, default: 'ANALYZED' })
  status: string;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
