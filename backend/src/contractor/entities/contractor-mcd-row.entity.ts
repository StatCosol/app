import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ContractorMcdUploadEntity } from './contractor-mcd-upload.entity';
import { ContractorWageSkill } from './contractor-quotation-wage.entity';

export type ContractorMcdRowStatus =
  | 'MATCHED'
  | 'WAGE_MISMATCH'
  | 'GROSS_MISMATCH'
  | 'NO_QUOTATION'
  | 'INVALID';

const numericTransformer = {
  to: (v: number | null | undefined) => (v == null ? null : v),
  from: (v: string | null) => (v == null ? null : Number(v)),
};

@Entity({ name: 'contractor_mcd_rows' })
@Index('IDX_MCD_ROW_UPLOAD', ['uploadId'])
@Index('IDX_MCD_ROW_STATUS', ['matchStatus'])
export class ContractorMcdRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'upload_id', type: 'uuid' })
  uploadId: string;

  @ManyToOne(() => ContractorMcdUploadEntity, (upload) => upload.rows, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'upload_id' })
  upload?: ContractorMcdUploadEntity;

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
    name: 'mcd_daily_wage',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  mcdDailyWage: number | null;

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
    name: 'expected_basic_wage',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  expectedBasicWage: number;

  @Column({
    name: 'reported_basic_wage',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  reportedBasicWage: number | null;

  @Column({
    name: 'other_earnings',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  otherEarnings: number;

  @Column({
    name: 'computed_gross',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  computedGross: number;

  @Column({
    name: 'reported_gross',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  reportedGross: number | null;

  @Column({
    name: 'pf_deduction',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  pfDeduction: number;

  @Column({
    name: 'esi_deduction',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  esiDeduction: number;

  @Column({
    name: 'pt_deduction',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  ptDeduction: number;

  @Column({
    name: 'other_deductions',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  otherDeductions: number;

  @Column({
    name: 'net_salary',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  netSalary: number;

  @Column({ name: 'match_status', type: 'varchar', length: 30 })
  matchStatus: ContractorMcdRowStatus;

  @Column({ name: 'mismatch_reason', type: 'text', nullable: true })
  mismatchReason: string | null;

  @Column({ name: 'raw_data', type: 'jsonb', nullable: true })
  rawData: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
