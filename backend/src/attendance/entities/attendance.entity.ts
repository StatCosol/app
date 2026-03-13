import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'attendance_records' })
@Index(['employeeId', 'date'], { unique: true })
export class AttendanceEntity {
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

  @Column({ name: 'employee_code', type: 'varchar', length: 50 })
  employeeCode: string;

  @Index()
  @Column({ name: 'date', type: 'date' })
  date: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: 'PRESENT',
  })
  status:
    | 'PRESENT'
    | 'ABSENT'
    | 'HALF_DAY'
    | 'ON_LEAVE'
    | 'HOLIDAY'
    | 'WEEK_OFF';

  @Column({ name: 'check_in', type: 'time', nullable: true })
  checkIn: string | null;

  @Column({ name: 'check_out', type: 'time', nullable: true })
  checkOut: string | null;

  @Column({
    name: 'worked_hours',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  workedHours: string | null;

  @Column({
    name: 'overtime_hours',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  overtimeHours: string;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'source', type: 'varchar', length: 30, default: 'MANUAL' })
  source: 'MANUAL' | 'BIOMETRIC' | 'IMPORT';

  @Column({ name: 'leave_application_id', type: 'uuid', nullable: true })
  leaveApplicationId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
