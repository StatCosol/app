import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ContractorWageSkill } from './contractor-quotation-wage.entity';

const numericTransformer = {
  to: (v: number | null | undefined) => (v == null ? null : v),
  from: (v: string | null) => (v == null ? null : Number(v)),
};

@Entity({ name: 'contractor_mcd_computations' })
@Index('IDX_CMCD_CLIENT_CONTRACTOR', ['clientId', 'contractorUserId'])
@Index('IDX_CMCD_UPLOAD', ['uploadId'])
export class ContractorMcdComputationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'upload_id', type: 'uuid', nullable: true })
  uploadId: string | null;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'contractor_user_id', type: 'uuid' })
  contractorUserId: string;

  @Column({ name: 'period_month', type: 'varchar', length: 7 })
  periodMonth: string;

  @Column({ name: 'row_number', type: 'int' })
  rowNumber: number;

  @Column({
    name: 'employee_code',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  employeeCode: string | null;

  @Column({ name: 'employee_name', type: 'varchar', length: 255 })
  employeeName: string;

  @Column({ name: 'skill_category', type: 'varchar', length: 20 })
  skillCategory: ContractorWageSkill;

  @Column({
    name: 'days_worked',
    type: 'numeric',
    precision: 8,
    scale: 2,
    transformer: numericTransformer,
  })
  daysWorked: number;

  @Column({
    name: 'quotation_daily_wage',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  quotationDailyWage: number | null;

  @Column({
    name: 'mcd_daily_wage',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  mcdDailyWage: number | null;

  @Column({
    name: 'basic_wage',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  basicWage: number;

  @Column({
    name: 'other_earnings',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  otherEarnings: number;

  @Column({
    name: 'gross_wage',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  grossWage: number;

  @Column({
    name: 'pf_deduction',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  pfDeduction: number;

  @Column({
    name: 'esi_deduction',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  esiDeduction: number;

  @Column({
    name: 'pt_deduction',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  ptDeduction: number;

  @Column({
    name: 'net_salary',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  netSalary: number;

  @Column({ name: 'match_status', type: 'varchar', length: 30 })
  matchStatus: 'MATCHED' | 'MISMATCH' | 'NO_QUOTATION';

  @Column({ name: 'mismatch_reason', type: 'text', nullable: true })
  mismatchReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
