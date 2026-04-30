import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'payroll_client_component_overrides' })
@Index(['clientId', 'componentId'], { unique: true })
export class PayrollClientComponentOverrideEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Index()
  @Column({ name: 'component_id', type: 'uuid' })
  componentId: string;

  @Column({ name: 'enabled', type: 'boolean', nullable: true })
  enabled: boolean | null;

  @Column({ name: 'display_order', type: 'int', nullable: true })
  displayOrder: number | null;

  @Column({ name: 'show_on_payslip', type: 'boolean', nullable: true })
  showOnPayslip: boolean | null;

  @Column({
    name: 'label_override',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  labelOverride: string | null;

  @Column({ name: 'formula_override', type: 'text', nullable: true })
  formulaOverride: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
