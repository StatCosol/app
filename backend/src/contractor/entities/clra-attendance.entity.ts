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

@Entity({ name: 'clra_attendance' })
@Unique('UQ_CLRA_ATT', ['workerDeploymentId', 'attendanceDate'])
@Index('IDX_CLRA_ATT_PERIOD', ['wagePeriodId'])
@Index('IDX_CLRA_ATT_WORKER', ['workerDeploymentId'])
export class ClraAttendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'wage_period_id', type: 'uuid' })
  wagePeriodId: string;

  @Column({ name: 'worker_deployment_id', type: 'uuid' })
  workerDeploymentId: string;

  @Column({ name: 'attendance_date', type: 'date' })
  attendanceDate: string;

  @Column({ length: 20, default: 'P' })
  status: string;

  @Column({ name: 'in_time', type: 'time', nullable: true })
  inTime: string | null;

  @Column({ name: 'out_time', type: 'time', nullable: true })
  outTime: string | null;

  @Column({ name: 'normal_hours', type: 'numeric', precision: 6, scale: 2, default: 0, transformer: { to: (v) => v, from: (v) => v != null ? parseFloat(v) : 0 } })
  normalHours: number;

  @Column({ name: 'ot_hours', type: 'numeric', precision: 6, scale: 2, default: 0, transformer: { to: (v) => v, from: (v) => v != null ? parseFloat(v) : 0 } })
  otHours: number;

  @ManyToOne(() => ClraWagePeriod, (p) => p.attendanceRows, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wage_period_id' })
  wagePeriod: ClraWagePeriod;

  @ManyToOne(() => ClraWorkerDeployment, (d) => d.attendanceRows, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'worker_deployment_id' })
  workerDeployment: ClraWorkerDeployment;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
