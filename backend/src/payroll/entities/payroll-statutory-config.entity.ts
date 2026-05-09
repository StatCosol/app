import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PayrollClientStructureEntity } from './payroll-client-structure.entity';

@Entity('payroll_statutory_configs')
@Index(['structureId', 'stateCode'], { unique: true })
export class PayrollStatutoryConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'structure_id', type: 'uuid' })
  structureId: string;

  @ManyToOne(() => PayrollClientStructureEntity, (s) => s.statutoryConfigs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'structure_id' })
  structure: PayrollClientStructureEntity;

  @Column({ name: 'state_code', type: 'varchar', length: 10 })
  stateCode: string;

  @Column({
    name: 'minimum_wage',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  minimumWage: number | null;

  @Column({
    name: 'warn_if_gross_below_min_wage',
    type: 'boolean',
    default: true,
  })
  warnIfGrossBelowMinWage: boolean;

  @Column({ name: 'enable_pt', type: 'boolean', default: true })
  enablePt: boolean;

  @Column({ name: 'enable_pf', type: 'boolean', default: true })
  enablePf: boolean;

  @Column({ name: 'enable_esi', type: 'boolean', default: true })
  enableEsi: boolean;

  @Column({
    name: 'pf_employee_rate',
    type: 'numeric',
    precision: 8,
    scale: 4,
    default: 12,
  })
  pfEmployeeRate: number;

  @Column({
    name: 'pf_wage_cap',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 15000,
  })
  pfWageCap: number;

  @Column({
    name: 'pf_apply_if_gross_above',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  pfApplyIfGrossAbove: number | null;

  @Column({
    name: 'esi_employee_rate',
    type: 'numeric',
    precision: 8,
    scale: 4,
    default: 0.75,
  })
  esiEmployeeRate: number;

  @Column({
    name: 'esi_employer_rate',
    type: 'numeric',
    precision: 8,
    scale: 4,
    default: 3.25,
  })
  esiEmployerRate: number;

  @Column({
    name: 'esi_gross_ceiling',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 21000,
  })
  esiGrossCeiling: number;

  @Column({
    name: 'carry_forward_leave',
    type: 'boolean',
    default: true,
  })
  carryForwardLeave: boolean;

  @Column({
    name: 'monthly_paid_leave_accrual',
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 1.5,
  })
  monthlyPaidLeaveAccrual: number;

  @Column({
    name: 'attendance_bonus_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  attendanceBonusAmount: number | null;

  @Column({
    name: 'attendance_bonus_if_lop_lte',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  attendanceBonusIfLopLte: number | null;
}
