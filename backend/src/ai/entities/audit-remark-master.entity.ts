import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'audit_remark_master' })
@Index(['stateCode', 'actCode'])
@Index(['findingType'])
export class AuditRemarkMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  @Column({ name: 'state_code', type: 'varchar', length: 8, nullable: true })
  stateCode: string | null;

  @Column({ name: 'act_code', type: 'varchar', length: 64, nullable: true })
  actCode: string | null;

  @Column({
    name: 'compliance_area',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  complianceArea: string | null;

  @Column({
    name: 'document_type',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  documentType: string | null;

  @Column({
    name: 'finding_type',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  findingType: string | null;

  @Column({ name: 'raw_finding', type: 'text' })
  rawFinding: string;

  @Column({ name: 'normalized_finding', type: 'text' })
  normalizedFinding: string;

  @Column({
    name: 'finding_signature',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  findingSignature: string | null;

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
    precision: 14,
    scale: 2,
    nullable: true,
  })
  fineEstimationMin: string | null;

  @Column({
    name: 'fine_estimation_max',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  fineEstimationMax: string | null;

  @Column({ name: 'risk_rating', type: 'varchar', length: 16, nullable: true })
  riskRating: string | null;

  @Column({ name: 'corrective_action', type: 'text', nullable: true })
  correctiveAction: string | null;

  @Column({ name: 'timeline_days', type: 'int', nullable: true })
  timelineDays: number | null;

  @Column({ name: 'state_specific_rules', type: 'text', nullable: true })
  stateSpecificRules: string | null;

  @Column({ type: 'varchar', length: 32, default: 'AI' })
  source: string;

  @Column({ name: 'confidence_score', type: 'int', nullable: true })
  confidenceScore: number | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'usage_count', type: 'int', default: 0 })
  usageCount: number;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
