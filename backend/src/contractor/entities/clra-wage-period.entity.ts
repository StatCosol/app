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
import { ClraAttendance } from './clra-attendance.entity';
import { ClraWage } from './clra-wage.entity';

@Entity({ name: 'clra_wage_periods' })
@Unique('UQ_CLRA_WP', ['assignmentId', 'periodFrom', 'periodTo'])
@Index('IDX_CLRA_WP_ASSIGNMENT', ['assignmentId'])
@Index('IDX_CLRA_WP_MONTH', ['wageYear', 'wageMonth'])
export class ClraWagePeriod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'assignment_id', type: 'uuid' })
  assignmentId: string;

  @Column({ name: 'period_from', type: 'date' })
  periodFrom: string;

  @Column({ name: 'period_to', type: 'date' })
  periodTo: string;

  @Column({ name: 'wage_month', type: 'int' })
  wageMonth: number;

  @Column({ name: 'wage_year', type: 'int' })
  wageYear: number;

  @Column({ name: 'payment_date', type: 'date', nullable: true })
  paymentDate: string | null;

  @Column({
    name: 'payment_place',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  paymentPlace: string | null;

  @Column({ length: 30, default: 'OPEN' })
  status: string;

  @ManyToOne(() => ClraContractorAssignment, (a) => a.wagePeriods, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assignment_id' })
  assignment: ClraContractorAssignment;

  @OneToMany(() => ClraAttendance, (a) => a.wagePeriod)
  attendanceRows: ClraAttendance[];

  @OneToMany(() => ClraWage, (w) => w.wagePeriod)
  wageRows: ClraWage[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
