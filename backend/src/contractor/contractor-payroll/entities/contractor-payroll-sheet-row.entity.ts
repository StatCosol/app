import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

const num = (precision: number, scale: number) => ({
  type: 'numeric' as const,
  precision,
  scale,
  default: 0,
  transformer: {
    to: (v: number) => v,
    from: (v: string | null) => (v == null ? 0 : Number(v)),
  },
});

@Entity({ name: 'contractor_payroll_sheet_rows' })
export class ContractorPayrollSheetRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sheet_id', type: 'uuid' })
  sheetId: string;

  @Column({ name: 'contractor_employee_id', type: 'uuid' })
  contractorEmployeeId: string;

  @Column({ name: 'employee_name', type: 'varchar', length: 250 })
  employeeName: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  designation: string | null;

  @Column({ name: 'monthly_gross', ...num(12, 2) })
  monthlyGross: number;

  @Column({ name: 'basic_da_pct', type: 'smallint', default: 50 })
  basicDaPct: number;

  @Column({ name: 'worked_days', ...num(6, 2) })
  workedDays: number;

  @Column({ name: 'daily_rate', ...num(12, 4) })
  dailyRate: number;

  @Column({ name: 'earned_gross', ...num(12, 2) })
  earnedGross: number;

  @Column({ name: 'pf_basis', ...num(12, 2) })
  pfBasis: number;

  @Column({ name: 'pf_employee', ...num(12, 2) })
  pfEmployee: number;

  @Column({ name: 'pf_employer', ...num(12, 2) })
  pfEmployer: number;

  @Column({ name: 'esi_employee', ...num(12, 2) })
  esiEmployee: number;

  @Column({ name: 'esi_employer', ...num(12, 2) })
  esiEmployer: number;

  @Column({ name: 'net_pay', ...num(12, 2) })
  netPay: number;

  @Column({ name: 'ctc', ...num(12, 2) })
  ctc: number;

  @Column({ name: 'attendance_source', type: 'varchar', length: 10, default: 'NONE' })
  attendanceSource: 'UPLOAD' | 'KIOSK' | 'MIXED' | 'NONE';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
