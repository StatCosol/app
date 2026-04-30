import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AppraisalTemplateEntity } from './appraisal-template.entity';

@Entity({ name: 'appraisal_cycles' })
export class AppraisalCycleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'cycle_code', type: 'varchar', length: 30 })
  cycleCode: string;

  @Column({ name: 'cycle_name', type: 'varchar', length: 150 })
  cycleName: string;

  @Column({ name: 'financial_year', type: 'varchar', length: 20 })
  financialYear: string;

  @Column({
    name: 'appraisal_type',
    type: 'varchar',
    length: 30,
    default: 'ANNUAL',
  })
  appraisalType: string;

  @Column({ name: 'review_period_from', type: 'date' })
  reviewPeriodFrom: string;

  @Column({ name: 'review_period_to', type: 'date' })
  reviewPeriodTo: string;

  @Column({ name: 'effective_date', type: 'date', nullable: true })
  effectiveDate: string | null;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId: string | null;

  @ManyToOne(() => AppraisalTemplateEntity, { eager: false })
  @JoinColumn({ name: 'template_id' })
  template?: AppraisalTemplateEntity;

  @Index()
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
