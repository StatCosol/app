import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AuditEntity } from './audit.entity';
import { AuditObservationCategoryEntity } from './audit-observation-category.entity';

@Entity({ name: 'audit_observations', schema: 'public' })
@Index('IDX_AO_AUDIT', ['auditId'])
@Index('IDX_AO_CATEGORY', ['categoryId'])
@Index('IDX_AO_STATUS', ['status'])
@Index('IDX_AO_RISK', ['risk'])
@Index('IDX_AO_RECORDED_BY', ['recordedByUserId'])
export class AuditObservationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'audit_id' })
  auditId: string;

  @ManyToOne(() => AuditEntity)
  @JoinColumn({ name: 'audit_id' })
  audit?: AuditEntity;

  @Column({ type: 'uuid', name: 'category_id', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => AuditObservationCategoryEntity)
  @JoinColumn({ name: 'category_id' })
  category?: AuditObservationCategoryEntity;

  @Column({ type: 'int', name: 'sequence_number', nullable: true })
  sequenceNumber: number | null;

  // DTSS Format: 4 sections
  @Column({ type: 'text' })
  observation: string; // What was observed

  @Column({ type: 'text', nullable: true })
  consequences: string | null; // What could happen if not addressed

  @Column({ type: 'text', name: 'compliance_requirements', nullable: true })
  complianceRequirements: string | null; // What law/rule requires this

  @Column({ type: 'text', nullable: true })
  elaboration: string | null; // Full detailed explanation

  @Column({ type: 'varchar', length: 255, nullable: true })
  clause: string | null; // Legal section / act reference

  @Column({ type: 'text', nullable: true })
  recommendation: string | null; // Corrective action guidance

  @Column({ type: 'text', nullable: true })
  risk: string | null; // CRITICAL, HIGH, MEDIUM, LOW

  @Column({ type: 'varchar', length: 50, default: 'OPEN' })
  status: string; // OPEN, ACKNOWLEDGED, RESOLVED, CLOSED

  @Column({ type: 'uuid', name: 'recorded_by_user_id' })
  recordedByUserId: string;

  @Column({ type: 'text', name: 'evidence_file_paths', nullable: true })
  evidenceFilePaths: string | null; // JSON array of file paths

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
