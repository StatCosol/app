import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A client's holiday calendar. A holiday can be scoped to a specific branch,
 * to a state (applies to every branch in that state), or client-wide (both
 * branchId and stateCode null). Uploaded via Excel and applied onto
 * attendance_records (marking those days HOLIDAY).
 */
@Entity({ name: 'holiday_calendar' })
@Index(['clientId', 'holidayDate'])
export class HolidayCalendarEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  /** Specific branch this holiday applies to, or null for state/client-wide. */
  @Index()
  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  /** State the holiday applies to (matched against branch.statecode), or null. */
  @Column({ name: 'state_code', type: 'varchar', length: 10, nullable: true })
  stateCode: string | null;

  @Column({ name: 'holiday_date', type: 'date' })
  holidayDate: string;

  @Column({ name: 'name', type: 'varchar', length: 120 })
  name: string;

  /** Paid holiday (default). Unpaid holidays can be flagged false. */
  @Column({ name: 'is_paid', type: 'boolean', default: true })
  isPaid: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
