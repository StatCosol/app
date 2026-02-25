import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ClientEntity } from '../../clients/entities/client.entity';

@Entity({ name: 'ai_risk_assessments' })
export class AiRiskAssessmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => ClientEntity, { eager: false })
  @JoinColumn({ name: 'client_id' })
  client?: ClientEntity;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'assessment_type', type: 'varchar', length: 50, default: 'COMPLIANCE' })
  assessmentType: string;

  @Column({ name: 'risk_score', type: 'int' })
  riskScore: number;

  @Column({ name: 'risk_level', type: 'varchar', length: 20, default: 'MEDIUM' })
  riskLevel: string;

  @Column({ name: 'inspection_probability', type: 'numeric', precision: 5, scale: 2, nullable: true })
  inspectionProbability: number | null;

  @Column({ name: 'penalty_exposure_min', type: 'numeric', precision: 12, scale: 2, nullable: true })
  penaltyExposureMin: number | null;

  @Column({ name: 'penalty_exposure_max', type: 'numeric', precision: 12, scale: 2, nullable: true })
  penaltyExposureMax: number | null;

  @Column({ type: 'text' })
  summary: string;

  @Column({ name: 'risk_factors', type: 'jsonb', default: '[]' })
  riskFactors: any[];

  @Column({ type: 'jsonb', default: '[]' })
  recommendations: any[];

  @Column({ type: 'jsonb', default: '{}' })
  predictions: Record<string, any>;

  @Column({ name: 'input_data', type: 'jsonb', default: '{}' })
  inputData: Record<string, any>;

  @Column({ name: 'ai_model', type: 'varchar', length: 100, nullable: true })
  aiModel: string | null;

  @Column({ name: 'ai_prompt_tokens', type: 'int', nullable: true })
  aiPromptTokens: number | null;

  @Column({ name: 'ai_completion_tokens', type: 'int', nullable: true })
  aiCompletionTokens: number | null;

  @Column({ name: 'assessed_by', type: 'uuid', nullable: true })
  assessedBy: string | null;

  @Column({ name: 'period_month', type: 'int', nullable: true })
  periodMonth: number | null;

  @Column({ name: 'period_year', type: 'int', nullable: true })
  periodYear: number | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
