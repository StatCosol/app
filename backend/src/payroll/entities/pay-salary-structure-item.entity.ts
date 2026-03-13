import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'pay_salary_structure_items' })
@Index(['structureId', 'componentId'], { unique: true })
@Index(['structureId', 'priority'])
export class PaySalaryStructureItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'structure_id', type: 'uuid' })
  structureId: string;

  @Column({ name: 'component_id', type: 'uuid' })
  componentId: string;

  @Column({ name: 'calc_method', type: 'varchar', length: 30 })
  calcMethod: 'FIXED' | 'PERCENT' | 'FORMULA' | 'SLAB' | 'BALANCING';

  @Column({
    name: 'fixed_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  fixedAmount: number | null;

  @Column({
    name: 'percentage',
    type: 'numeric',
    precision: 8,
    scale: 4,
    nullable: true,
  })
  percentage: number | null;

  @Column({
    name: 'percentage_base',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  percentageBase: 'BASIC' | 'GROSS' | 'CTC' | 'PF_WAGE' | 'ESI_WAGE' | null;

  @Column({ name: 'formula', type: 'text', nullable: true })
  formula: string | null;

  @Column({ name: 'slab_ref', type: 'jsonb', nullable: true })
  slabRef: Record<string, unknown> | null;

  @Column({ name: 'balancing_config', type: 'jsonb', nullable: true })
  balancingConfig: Record<string, unknown> | null;

  @Column({
    name: 'min_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  minAmount: number | null;

  @Column({
    name: 'max_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  maxAmount: number | null;

  @Column({
    name: 'rounding_mode',
    type: 'varchar',
    length: 20,
    default: 'NEAREST_RUPEE',
  })
  roundingMode: string;

  @Column({ name: 'priority', type: 'int', default: 0 })
  priority: number;

  @Column({ name: 'enabled', type: 'boolean', default: true })
  enabled: boolean;
}
