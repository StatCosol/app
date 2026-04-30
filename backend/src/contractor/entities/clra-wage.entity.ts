import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ClraWagePeriod } from './clra-wage-period.entity';
import { ClraWorkerDeployment } from './clra-worker-deployment.entity';

@Entity({ name: 'clra_wages' })
@Unique('UQ_CLRA_WAGE', ['wagePeriodId', 'workerDeploymentId'])
@Index('IDX_CLRA_WAGE_PERIOD', ['wagePeriodId'])
export class ClraWage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'wage_period_id', type: 'uuid' })
  wagePeriodId: string;

  @Column({ name: 'worker_deployment_id', type: 'uuid' })
  workerDeploymentId: string;

  @Column({
    name: 'days_worked',
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => (v != null ? parseFloat(v) : 0) },
  })
  daysWorked: number;

  @Column({
    name: 'units_worked',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v) => v,
      from: (v) => (v != null ? parseFloat(v) : null),
    },
  })
  unitsWorked: number | null;

  @Column({
    name: 'basic_wage',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => (v != null ? parseFloat(v) : 0) },
  })
  basicWage: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => (v != null ? parseFloat(v) : 0) },
  })
  da: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => (v != null ? parseFloat(v) : 0) },
  })
  hra: number;

  @Column({
    name: 'ot_wages',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => (v != null ? parseFloat(v) : 0) },
  })
  otWages: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => (v != null ? parseFloat(v) : 0) },
  })
  allowances: number;

  @Column({
    name: 'gross_wages',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => (v != null ? parseFloat(v) : 0) },
  })
  grossWages: number;

  @Column({
    name: 'pf_deduction',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => (v != null ? parseFloat(v) : 0) },
  })
  pfDeduction: number;

  @Column({
    name: 'esi_deduction',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => (v != null ? parseFloat(v) : 0) },
  })
  esiDeduction: number;

  @Column({
    name: 'pt_deduction',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => (v != null ? parseFloat(v) : 0) },
  })
  ptDeduction: number;

  @Column({
    name: 'other_deductions',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => (v != null ? parseFloat(v) : 0) },
  })
  otherDeductions: number;

  @Column({
    name: 'net_wages',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => (v != null ? parseFloat(v) : 0) },
  })
  netWages: number;

  @ManyToOne(() => ClraWagePeriod, (p) => p.wageRows, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wage_period_id' })
  wagePeriod: ClraWagePeriod;

  @ManyToOne(() => ClraWorkerDeployment, (d) => d.wageRows, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'worker_deployment_id' })
  workerDeployment: ClraWorkerDeployment;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
