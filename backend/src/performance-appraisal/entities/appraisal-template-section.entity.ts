import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AppraisalTemplateEntity } from './appraisal-template.entity';

@Entity({ name: 'appraisal_template_sections' })
export class AppraisalTemplateSectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @ManyToOne(() => AppraisalTemplateEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template?: AppraisalTemplateEntity;

  @Column({ name: 'section_code', type: 'varchar', length: 50 })
  sectionCode: string;

  @Column({ name: 'section_name', type: 'varchar', length: 100 })
  sectionName: string;

  @Column({ name: 'section_type', type: 'varchar', length: 30, default: 'KPI' })
  sectionType: string;

  @Column({ name: 'sequence', type: 'int', default: 0 })
  sequence: number;

  @Column({ name: 'weightage', type: 'numeric', precision: 5, scale: 2, default: 0 })
  weightage: number;

  @Column({ name: 'is_required', type: 'boolean', default: true })
  isRequired: boolean;
}
