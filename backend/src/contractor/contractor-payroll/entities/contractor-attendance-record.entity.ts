import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'contractor_attendance_records' })
@Index('IDX_CAR_EMP_DATE', ['contractorEmployeeId', 'attendanceDate'])
export class ContractorAttendanceRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'upload_id', type: 'uuid', nullable: true })
  uploadId: string | null;

  @Column({ name: 'contractor_employee_id', type: 'uuid' })
  contractorEmployeeId: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'attendance_date', type: 'date' })
  attendanceDate: string;

  @Column({ type: 'varchar', length: 10, default: 'PRESENT' })
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY';

  @Column({ type: 'varchar', length: 10, default: 'UPLOAD' })
  source: 'UPLOAD' | 'KIOSK';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
