import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'threshold_master' })
@Index(['code', 'stateCode', 'effectiveFrom'])
export class ThresholdMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'value_number', type: 'numeric', nullable: true })
  valueNumber: string | null;

  @Column({ name: 'value_text', type: 'text', nullable: true })
  valueText: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'state_code', type: 'text', nullable: true })
  stateCode: string | null;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;
}
