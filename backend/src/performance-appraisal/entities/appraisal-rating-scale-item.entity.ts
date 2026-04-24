import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AppraisalRatingScaleEntity } from './appraisal-rating-scale.entity';

@Entity({ name: 'appraisal_rating_scale_items' })
export class AppraisalRatingScaleItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'scale_id', type: 'uuid' })
  scaleId: string;

  @ManyToOne(() => AppraisalRatingScaleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scale_id' })
  scale?: AppraisalRatingScaleEntity;

  @Column({ name: 'rating_code', type: 'varchar', length: 30 })
  ratingCode: string;

  @Column({ name: 'rating_label', type: 'varchar', length: 100 })
  ratingLabel: string;

  @Column({ name: 'min_score', type: 'numeric', precision: 5, scale: 2 })
  minScore: number;

  @Column({ name: 'max_score', type: 'numeric', precision: 5, scale: 2 })
  maxScore: number;

  @Column({ name: 'color_code', type: 'varchar', length: 20, nullable: true })
  colorCode: string | null;

  @Column({ name: 'sequence', type: 'int', default: 0 })
  sequence: number;
}
