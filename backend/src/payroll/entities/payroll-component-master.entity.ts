import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'payroll_component_master' })
export class PayrollComponentMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'code', type: 'varchar', length: 50 })
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

  @Column({ name: 'default_formula', type: 'text', nullable: true })
  defaultFormula: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
