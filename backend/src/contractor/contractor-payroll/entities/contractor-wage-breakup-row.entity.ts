import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

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

@Entity({ name: 'contractor_wage_breakup_rows' })
@Index('IDX_CWBR_CLIENT_EMP_MONTH', ['clientId', 'contractorEmployeeId', 'month', 'year'], { unique: true })
export class ContractorWageBreakupRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'upload_id', type: 'uuid' })
  uploadId: string;

  @Column({ name: 'contractor_employee_id', type: 'uuid' })
  contractorEmployeeId: string;

  @Column({ name: 'employee_name', type: 'varchar', length: 250 })
  employeeName: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ type: 'smallint' })
  month: number;

  @Column({ type: 'smallint' })
  year: number;

  @Column({ name: 'basic', ...num(12, 2) })
  basic: number;

  @Column({ name: 'da', ...num(12, 2) })
  da: number;

  @Column({ name: 'hra', ...num(12, 2) })
  hra: number;

  @Column({ name: 'special_allowance', ...num(12, 2) })
  specialAllowance: number;

  @Column({ name: 'other_allowances', ...num(12, 2) })
  otherAllowances: number;

  @Column({ name: 'monthly_gross', ...num(12, 2) })
  monthlyGross: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
