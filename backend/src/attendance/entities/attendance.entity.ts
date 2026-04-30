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

  @Column({
    name: 'capture_method',
    type: 'varchar',
    length: 20,
    default: 'MANUAL',
  })
  captureMethod: 'MANUAL' | 'BIOMETRIC' | 'FACE' | 'GEOLOCATION';

  @Column({
    name: 'check_in_lat',
    type: 'numeric',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  checkInLat: string | null;

  @Column({
    name: 'check_in_lng',
    type: 'numeric',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  checkInLng: string | null;

  @Column({
    name: 'check_out_lat',
    type: 'numeric',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  checkOutLat: string | null;

  @Column({
    name: 'check_out_lng',
    type: 'numeric',
    precision: 10,
    scale: 7,
    nullable: true,
  })
  checkOutLng: string | null;

  @Column({ name: 'device_info', type: 'varchar', length: 255, nullable: true })
  deviceInfo: string | null;

  @Column({ name: 'self_marked', type: 'boolean', default: false })
  selfMarked: boolean;

  @Column({ name: 'short_work_reason', type: 'text', nullable: true })
  shortWorkReason: string | null;

  @Column({
    name: 'overtime_type',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  overtimeType: string | null; // 'OT' | 'COFF' | null

  @Column({ name: 'leave_application_id', type: 'uuid', nullable: true })
  leaveApplicationId: string | null;

  @Column({
    name: 'approval_status',
    type: 'varchar',
    length: 20,
    default: 'PENDING',
  })
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';

  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
