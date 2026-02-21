import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'payroll_client_setup' })
export class PayrollClientSetupEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid', unique: true })
  clientId: string;

  @Column({ name: 'pf_enabled', type: 'boolean', default: true })
  pfEnabled: boolean;

  @Column({ name: 'esi_enabled', type: 'boolean', default: true })
  esiEnabled: boolean;

  @Column({ name: 'pt_enabled', type: 'boolean', default: false })
  ptEnabled: boolean;

  @Column({ name: 'lwf_enabled', type: 'boolean', default: false })
  lwfEnabled: boolean;

  @Column({ name: 'pf_employer_rate', type: 'numeric', precision: 5, scale: 2, default: 12.0 })
  pfEmployerRate: string;

  @Column({ name: 'pf_employee_rate', type: 'numeric', precision: 5, scale: 2, default: 12.0 })
  pfEmployeeRate: string;

  @Column({ name: 'esi_employer_rate', type: 'numeric', precision: 5, scale: 2, default: 3.25 })
  esiEmployerRate: string;

  @Column({ name: 'esi_employee_rate', type: 'numeric', precision: 5, scale: 2, default: 0.75 })
  esiEmployeeRate: string;

  @Column({ name: 'pf_wage_ceiling', type: 'numeric', precision: 14, scale: 2, default: 15000 })
  pfWageCeiling: string;

  @Column({ name: 'esi_wage_ceiling', type: 'numeric', precision: 14, scale: 2, default: 21000 })
  esiWageCeiling: string;

  @Column({ name: 'pay_cycle', type: 'varchar', length: 20, default: 'MONTHLY' })
  payCycle: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
