import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'payroll_components' })
@Index(['clientId', 'code'], { unique: true })
export class PayrollComponentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'code', type: 'varchar', length: 60 })
  code: string;

  @Column({ name: 'name', type: 'varchar', length: 200 })
  name: string;

  @Column({ name: 'component_type', type: 'varchar', length: 30 })
  componentType: 'EARNING' | 'DEDUCTION' | 'EMPLOYER' | 'INFO';

  @Column({ name: 'is_taxable', type: 'boolean', default: false })
  isTaxable: boolean;

  @Column({ name: 'affects_pf_wage', type: 'boolean', default: false })
  affectsPfWage: boolean;

  @Column({ name: 'affects_esi_wage', type: 'boolean', default: false })
  affectsEsiWage: boolean;

  @Column({ name: 'is_required', type: 'boolean', default: false })
  isRequired: boolean;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
