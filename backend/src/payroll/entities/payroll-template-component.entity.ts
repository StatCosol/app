import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { PayrollTemplate } from './payroll-template.entity';

export type PayrollComponentType = 'EARNING' | 'DEDUCTION';

@Entity('payroll_template_components')
export class PayrollTemplateComponent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PayrollTemplate, (t) => t.components, {
    onDelete: 'CASCADE',
  })
  template: PayrollTemplate;

  @Column()
  code: string;

  @Column()
  label: string;

  @Column({ type: 'varchar' })
  type: PayrollComponentType;

  @Column({ type: 'varchar', nullable: true })
  input_type: string;

  @Column({ type: 'float', nullable: true })
  default_value: number;

  @Column({ type: 'int', default: 0 })
  order_no: number;

  @Column({ default: false })
  is_taxable: boolean;

  @Column({ default: false })
  is_statutory: boolean;

  @Column({ type: 'varchar', nullable: true })
  formula_expression: string;

  @Column({ type: 'varchar', nullable: true })
  round_rule: string;
}
