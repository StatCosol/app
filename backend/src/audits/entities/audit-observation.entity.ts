import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AuditEntity } from './audit.entity';
import { AuditObservationCategoryEntity } from './audit-observation-category.entity';

@Entity({ name: 'audit_observations', schema: 'public' })
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

  @Column({ type: 'int', nullable: true })
  sequenceNumber: number | null;

  // DTSS Format: 4 sections
  @Column({ type: 'text' })
  observation: string; // What was observed

  @Column({ type: 'text', nullable: true })
  consequences: string | null; // What could happen if not addressed

  @Column({ type: 'text', nullable: true })
  complianceRequirements: string | null; // What law/rule requires this

  @Column({ type: 'text', nullable: true })
  elaboration: string | null; // Full detailed explanation

  @Column({ type: 'text', nullable: true })
  risk: string | null; // CRITICAL, HIGH, MEDIUM, LOW

  @Column({ type: 'varchar', length: 50, default: 'OPEN' })
  status: string; // OPEN, ACKNOWLEDGED, RESOLVED, CLOSED

  @Column({ type: 'uuid', name: 'recorded_by_user_id' })
  recordedByUserId: string;

  @Column({ type: 'text', nullable: true })
  evidenceFilePaths: string | null; // JSON array of file paths

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
