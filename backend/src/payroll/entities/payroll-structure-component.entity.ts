import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PayrollClientStructureEntity } from './payroll-client-structure.entity';

@Entity('payroll_structure_components')
@Index(['structureId', 'code'], { unique: true })
export class PayrollStructureComponentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'structure_id', type: 'uuid' })
  structureId: string;

  @ManyToOne(() => PayrollClientStructureEntity, (s) => s.components, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'structure_id' })
  structure: PayrollClientStructureEntity;

  @Column({ name: 'code', type: 'varchar', length: 80 })
  code: string;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'label', type: 'varchar', length: 120 })
  label: string;

  @Column({
    name: 'component_type',
    type: 'varchar',
    length: 30,
  })
  componentType: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';

  @Column({
    name: 'calculation_method',
    type: 'varchar',
    length: 30,
  })
  calculationMethod:
    | 'FIXED'
    | 'PERCENTAGE'
    | 'FORMULA'
    | 'BALANCING'
    | 'CONDITIONAL_FIXED';

  @Column({ name: 'display_order', type: 'int', default: 1 })
  displayOrder: number;

  @Column({
    name: 'fixed_value',
    type: 'numeric',
    precision: 12,
    scale: 4,
    nullable: true,
  })
  fixedValue: number | null;

  @Column({
    name: 'percentage_value',
    type: 'numeric',
    precision: 12,
    scale: 4,
    nullable: true,
  })
  percentageValue: number | null;

  @Column({ name: 'based_on', type: 'varchar', length: 80, nullable: true })
  basedOn: string | null;

  @Column({ name: 'formula', type: 'text', nullable: true })
  formula: string | null;

  @Column({
    name: 'round_rule',
    type: 'varchar',
    length: 20,
    default: 'NONE',
  })
  roundRule: 'NONE' | 'ROUND' | 'ROUND_UP' | 'ROUND_DOWN';

  @Column({ name: 'taxable', type: 'boolean', default: true })
  taxable: boolean;

  @Column({ name: 'statutory', type: 'boolean', default: false })
  statutory: boolean;

  @Column({
    name: 'is_visible_in_payslip',
    type: 'boolean',
    default: true,
  })
  isVisibleInPayslip: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
