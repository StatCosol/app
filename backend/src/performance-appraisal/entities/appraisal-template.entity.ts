import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AppraisalRatingScaleEntity } from './appraisal-rating-scale.entity';

@Entity({ name: 'appraisal_templates' })
export class AppraisalTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  @Column({ name: 'template_code', type: 'varchar', length: 30 })
  templateCode: string;

  @Column({ name: 'template_name', type: 'varchar', length: 150 })
  templateName: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'rating_scale_id', type: 'uuid', nullable: true })
  ratingScaleId: string | null;

  @ManyToOne(() => AppraisalRatingScaleEntity, { eager: false })
  @JoinColumn({ name: 'rating_scale_id' })
  ratingScale?: AppraisalRatingScaleEntity;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
