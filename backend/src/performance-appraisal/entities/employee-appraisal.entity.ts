import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AppraisalCycleEntity } from './appraisal-cycle.entity';
import { EmployeeEntity } from '../../employees/entities/employee.entity';

@Entity({ name: 'employee_appraisals' })
export class EmployeeAppraisalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Index()
  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Index()
  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => EmployeeEntity, { eager: false })
  @JoinColumn({ name: 'employee_id' })
  employee?: EmployeeEntity;

  @Index()
  @Column({ name: 'cycle_id', type: 'uuid' })
  cycleId: string;

  @ManyToOne(() => AppraisalCycleEntity, { eager: false })
  @JoinColumn({ name: 'cycle_id' })
  cycle?: AppraisalCycleEntity;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId: string | null;

  @Column({ name: 'manager_id', type: 'uuid', nullable: true })
  managerId: string | null;

  @Index()
  @Column({ name: 'status', type: 'varchar', length: 30, default: 'INITIATED' })
  status: string;

  @Column({ name: 'self_status', type: 'varchar', length: 30, nullable: true })
  selfStatus: string | null;

  @Column({
    name: 'manager_status',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  managerStatus: string | null;

  @Column({
    name: 'branch_status',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  branchStatus: string | null;

  @Column({
    name: 'client_status',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  clientStatus: string | null;

  @Column({
    name: 'attendance_score',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  attendanceScore: number | null;

  @Column({
    name: 'kpi_score',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  kpiScore: number | null;

  @Column({
    name: 'competency_score',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  competencyScore: number | null;

  @Column({
    name: 'total_score',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  totalScore: number | null;

  @Column({
    name: 'final_rating_code',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  finalRatingCode: string | null;

  @Column({
    name: 'final_rating_label',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  finalRatingLabel: string | null;

  @Column({
    name: 'recommendation',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  recommendation: string | null;

  @Column({
    name: 'recommended_increment_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  recommendedIncrementPercent: number | null;

  @Column({
    name: 'recommended_increment_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  recommendedIncrementAmount: number | null;

  @Column({
    name: 'recommended_new_ctc',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  recommendedNewCtc: number | null;

  @Column({ name: 'promotion_designation_id', type: 'uuid', nullable: true })
  promotionDesignationId: string | null;

  @Column({ name: 'pip_required', type: 'boolean', default: false })
  pipRequired: boolean;

  @Column({ name: 'final_remarks', type: 'text', nullable: true })
  finalRemarks: string | null;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
