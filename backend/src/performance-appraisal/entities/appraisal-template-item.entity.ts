import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AppraisalTemplateEntity } from './appraisal-template.entity';
import { AppraisalTemplateSectionEntity } from './appraisal-template-section.entity';

@Entity({ name: 'appraisal_template_items' })
export class AppraisalTemplateItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @ManyToOne(() => AppraisalTemplateEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template?: AppraisalTemplateEntity;

  @Index()
  @Column({ name: 'section_id', type: 'uuid' })
  sectionId: string;

  @ManyToOne(() => AppraisalTemplateSectionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'section_id' })
  section?: AppraisalTemplateSectionEntity;

  @Column({ name: 'item_code', type: 'varchar', length: 50 })
  itemCode: string;

  @Column({ name: 'item_name', type: 'varchar', length: 150 })
  itemName: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'weightage',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  weightage: number;

  @Column({
    name: 'max_score',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 5,
  })
  maxScore: number;

  @Column({ name: 'sequence', type: 'int', default: 0 })
  sequence: number;

  @Column({
    name: 'input_type',
    type: 'varchar',
    length: 30,
    default: 'RATING',
  })
  inputType: string;

  @Column({ name: 'is_required', type: 'boolean', default: true })
  isRequired: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
