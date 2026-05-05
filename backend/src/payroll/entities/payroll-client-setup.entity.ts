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

  @Column({
    name: 'pf_employer_rate',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 12.0,
  })
  pfEmployerRate: string;

  @Column({
    name: 'pf_employee_rate',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 12.0,
  })
  pfEmployeeRate: string;

  @Column({
    name: 'esi_employer_rate',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 3.25,
  })
  esiEmployerRate: string;

  @Column({
    name: 'esi_employee_rate',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0.75,
  })
  esiEmployeeRate: string;

  @Column({
    name: 'pf_wage_ceiling',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 15000,
  })
  pfWageCeiling: string;

  @Column({
    name: 'pf_gross_threshold',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    comment:
      'PF only applies when gross exceeds this amount. 0 = apply to all.',
  })
  pfGrossThreshold: string;

  @Column({
    name: 'esi_wage_ceiling',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 21000,
  })
  esiWageCeiling: string;

  @Column({
    name: 'pay_cycle',
    type: 'varchar',
    length: 20,
    default: 'MONTHLY',
  })
  payCycle: string;

  @Column({ name: 'effective_from', type: 'date', nullable: true })
  effectiveFrom: string | null;

  @Column({ name: 'cycle_start_day', type: 'int', default: 1 })
  cycleStartDay: number;

  @Column({ name: 'payout_day', type: 'int', default: 1 })
  payoutDay: number;

  @Column({ name: 'lock_day', type: 'int', default: 26 })
  lockDay: number;

  @Column({
    name: 'arrear_mode',
    type: 'varchar',
    length: 20,
    default: 'CURRENT',
  })
  arrearMode: string;

  @Column({
    name: 'leave_accrual_per_month',
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 1.5,
  })
  leaveAccrualPerMonth: string;

  @Column({ name: 'max_carry_forward', type: 'int', default: 30 })
  maxCarryForward: number;

  @Column({ name: 'allow_carry_forward', type: 'boolean', default: true })
  allowCarryForward: boolean;

  @Column({
    name: 'lop_mode',
    type: 'varchar',
    length: 20,
    default: 'PRORATED',
  })
  lopMode: string;

  @Column({
    name: 'attendance_source',
    type: 'varchar',
    length: 20,
    default: 'MANUAL',
  })
  attendanceSource: string;

  @Column({ name: 'attendance_cutoff_day', type: 'int', default: 25 })
  attendanceCutoffDay: number;

  @Column({ name: 'grace_minutes', type: 'int', default: 10 })
  graceMinutes: number;

  @Column({ name: 'auto_lock_attendance', type: 'boolean', default: true })
  autoLockAttendance: boolean;

  @Column({ name: 'sync_enabled', type: 'boolean', default: false })
  syncEnabled: boolean;

  @Column({ name: 'enable_loan_recovery', type: 'boolean', default: true })
  enableLoanRecovery: boolean;

  @Column({ name: 'enable_advance_recovery', type: 'boolean', default: true })
  enableAdvanceRecovery: boolean;

  @Column({
    name: 'default_deduction_cap_pct',
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 50,
  })
  defaultDeductionCapPct: string;

  @Column({
    name: 'recovery_order',
    type: 'varchar',
    length: 220,
    default: 'STATUTORY > LOAN > ADVANCE > OTHER',
  })
  recoveryOrder: string;

  // Wage divisor basis used for prorating monthly earnings against PAYABLE_DAYS.
  //   FIXED_26      → divide by 26 (default Indian payroll convention)
  //   CALENDAR_DAYS → divide by actual days in the payroll month (28/29/30/31)
  //   WORKING_DAYS  → divide by working days in the month (configurable later)
  @Column({
    name: 'wage_basis_days',
    type: 'varchar',
    length: 20,
    default: 'FIXED_26',
  })
  wageBasisDays: string;

  // Overtime hourly multiplier. 1.0 = single wage, 2.0 = double wage (legacy default).
  @Column({
    name: 'ot_multiplier',
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: 2.0,
  })
  otMultiplier: string;

  // Hours that constitute one full working day for OT rate calculation.
  // Engine: per-hour wage = GROSS / wageBasisDaysCount / otHoursPerDay.
  // Default 8.0; VEIPL uses 8.5.
  @Column({
    name: 'ot_hours_per_day',
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: 8.0,
  })
  otHoursPerDay: string;

  // Days-in-month divisor used ONLY for OT base wage. Independent of
  // wage_basis_days (which controls EARNING pro-rata). Default 26.
  @Column({
    name: 'ot_days_in_month',
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: 26.0,
  })
  otDaysInMonth: string;

  // Number of worked days that earn 1 day of Earned Leave.
  // Engine: EL_ACCRUED = WORKED_DAYS / elAccrualDivisor.
  // Default 20 preserves the legacy hard-coded value (1.5 days/month at 30 worked days).
  @Column({
    name: 'el_accrual_divisor',
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 20,
  })
  elAccrualDivisor: string;

  // Number of worked days that earn 1 day of Sick Leave.
  // Engine: SL_ACCRUED = WORKED_DAYS / slAccrualDivisor.
  // Default 60 ≈ 0.5 day per 30 worked days (6 SL/year at full attendance).
  @Column({
    name: 'sl_accrual_divisor',
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 60,
  })
  slAccrualDivisor: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
