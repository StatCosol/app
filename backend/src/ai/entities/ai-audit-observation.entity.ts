import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ClientEntity } from '../../clients/entities/client.entity';

@Entity({ name: 'ai_audit_observations' })
export class AiAuditObservationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'audit_id', type: 'uuid', nullable: true })
  auditId: string | null;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => ClientEntity, { eager: false })
  @JoinColumn({ name: 'client_id' })
  client?: ClientEntity;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({
    name: 'finding_type',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  findingType: string | null;

  @Column({ name: 'finding_description', type: 'text' })
  findingDescription: string;

  @Column({ name: 'uploaded_documents', type: 'jsonb', default: '[]' })
  uploadedDocuments: any[];

  @Column({
    name: 'observation_title',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  observationTitle: string | null;

  @Column({ name: 'observation_text', type: 'text', nullable: true })
  observationText: string | null;

  @Column({ type: 'text', nullable: true })
  consequence: string | null;

  @Column({ name: 'section_reference', type: 'text', nullable: true })
  sectionReference: string | null;

  @Column({
    name: 'fine_estimation_min',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  fineEstimationMin: number | null;

  @Column({
    name: 'fine_estimation_max',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  fineEstimationMax: number | null;

  @Column({
    name: 'risk_rating',
    type: 'varchar',
    length: 20,
    default: 'MEDIUM',
  })
  riskRating: string;

  @Column({ name: 'corrective_action', type: 'text', nullable: true })
  correctiveAction: string | null;

  @Column({ name: 'timeline_days', type: 'int', nullable: true })
  timelineDays: number | null;

  @Column({
    name: 'applicable_state',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  applicableState: string | null;

  @Column({ name: 'state_specific_rules', type: 'text', nullable: true })
  stateSpecificRules: string | null;

  @Column({ name: 'ai_model', type: 'varchar', length: 100, nullable: true })
  aiModel: string | null;

  @Column({ name: 'ai_prompt_tokens', type: 'int', nullable: true })
  aiPromptTokens: number | null;

  @Column({ name: 'ai_completion_tokens', type: 'int', nullable: true })
  aiCompletionTokens: number | null;

  @Column({
    name: 'confidence_score',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  confidenceScore: number | null;

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status: string;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'auditor_notes', type: 'text', nullable: true })
  auditorNotes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
