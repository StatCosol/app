import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'payroll_input_status_history' })
export class PayrollInputStatusHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'payroll_input_id', type: 'uuid' })
  payrollInputId: string;

  @Column({ name: 'from_status', type: 'varchar', length: 50, nullable: true })
  fromStatus: string | null;

  @Column({ name: 'to_status', type: 'varchar', length: 50 })
  toStatus: string;

  @Index()
  @Column({ name: 'changed_by_user_id', type: 'uuid' })
  changedByUserId: string;

  @Column({ name: 'remarks', type: 'varchar', length: 500, nullable: true })
  remarks: string | null;

  @CreateDateColumn({ name: 'changed_at', type: 'timestamptz' })
  changedAt: Date;
}
