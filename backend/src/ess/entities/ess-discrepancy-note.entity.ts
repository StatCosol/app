import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'ess_discrepancy_notes' })
export class EssDiscrepancyNoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Index()
  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'employee_code', type: 'varchar', length: 50 })
  employeeCode: string;

  @Column({ name: 'attendance_date', type: 'date' })
  attendanceDate: string;

  @Column({ name: 'note', type: 'text' })
  note: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'OPEN' })
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';

  @Column({ name: 'hr_response', type: 'text', nullable: true })
  hrResponse: string | null;

  @Column({ name: 'hr_user_id', type: 'uuid', nullable: true })
  hrUserId: string | null;

  @Column({ name: 'hr_actioned_at', type: 'timestamptz', nullable: true })
  hrActionedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
