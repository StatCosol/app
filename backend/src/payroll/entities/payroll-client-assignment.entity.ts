import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('payroll_client_assignments')
@Index('uq_pca_active_partial', ['payrollUserId', 'clientId'], {
  unique: false, // actual uniqueness is enforced by partial index in DB
})
export class PayrollClientAssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'payroll_user_id' })
  payrollUserId: string;

  @Column({ type: 'uuid', name: 'client_id' })
  clientId: string;

  @Column({ type: 'date', name: 'start_date', default: () => 'CURRENT_DATE' })
  startDate: string;

  @Column({ type: 'date', name: 'end_date', nullable: true })
  endDate: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
