import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'payroll_component_rules' })
export class PayrollComponentRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'component_id', type: 'uuid' })
  componentId: string;

  @Column({ name: 'rule_type', type: 'varchar', length: 30 })
  ruleType: 'FIXED' | 'PERCENTAGE' | 'SLAB' | 'FORMULA';

  @Column({ name: 'base_component', type: 'varchar', length: 60, nullable: true })
  baseComponent: string | null;

  @Column({ name: 'percentage', type: 'numeric', precision: 8, scale: 4, nullable: true })
  percentage: string | null;

  @Column({ name: 'fixed_amount', type: 'numeric', precision: 14, scale: 2, nullable: true })
  fixedAmount: string | null;

  @Column({ name: 'formula', type: 'text', nullable: true })
  formula: string | null;

  @Column({ name: 'priority', type: 'int', default: 0 })
  priority: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
