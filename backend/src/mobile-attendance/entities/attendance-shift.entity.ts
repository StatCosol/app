import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'attendance_shifts' })
@Index(['employeeId'])
export class AttendanceShiftEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column({ name: 'grace_in_min', type: 'int', default: 15 })
  graceInMin: number;

  @Column({ name: 'grace_out_min', type: 'int', default: 15 })
  graceOutMin: number;

  @Column({ name: 'ot_threshold_min', type: 'int', default: 30 })
  otThresholdMin: number;

  @Column({ name: 'active', type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
