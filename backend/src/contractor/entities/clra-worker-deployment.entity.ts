import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ClraContractorAssignment } from './clra-contractor-assignment.entity';
import { ClraContractorWorker } from './clra-contractor-worker.entity';
import { ClraAttendance } from './clra-attendance.entity';
import { ClraWage } from './clra-wage.entity';

@Entity({ name: 'clra_worker_deployments' })
@Unique('UQ_CLRA_WD', ['assignmentId', 'workerId', 'deploymentStart'])
@Index('IDX_CLRA_WD_ASSIGNMENT', ['assignmentId'])
@Index('IDX_CLRA_WD_WORKER', ['workerId'])
export class ClraWorkerDeployment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'assignment_id', type: 'uuid' })
  assignmentId: string;

  @Column({ name: 'worker_id', type: 'uuid' })
  workerId: string;

  @Column({ name: 'deployment_start', type: 'date' })
  deploymentStart: string;

  @Column({ name: 'deployment_end', type: 'date', nullable: true })
  deploymentEnd: string | null;

  @Column({
    name: 'rate_per_day',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v) => v,
      from: (v) => (v != null ? parseFloat(v) : null),
    },
  })
  ratePerDay: number | null;

  @Column({
    name: 'rate_per_month',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v) => v,
      from: (v) => (v != null ? parseFloat(v) : null),
    },
  })
  ratePerMonth: number | null;

  @Column({
    name: 'ot_rate_per_hour',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v) => v,
      from: (v) => (v != null ? parseFloat(v) : null),
    },
  })
  otRatePerHour: number | null;

  @Column({ length: 30, default: 'ACTIVE' })
  status: string;

  @ManyToOne(() => ClraContractorAssignment, (a) => a.deployments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assignment_id' })
  assignment: ClraContractorAssignment;

  @ManyToOne(() => ClraContractorWorker, (w) => w.deployments, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'worker_id' })
  worker: ClraContractorWorker;

  @OneToMany(() => ClraAttendance, (a) => a.workerDeployment)
  attendanceRows: ClraAttendance[];

  @OneToMany(() => ClraWage, (w) => w.workerDeployment)
  wageRows: ClraWage[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
