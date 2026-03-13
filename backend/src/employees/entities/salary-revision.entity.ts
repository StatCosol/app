import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'employee_salary_revisions' })
@Index(['clientId', 'employeeId', 'effectiveDate'])
export class SalaryRevisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Index()
  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'effective_date', type: 'date' })
  effectiveDate: string;

  @Column({ name: 'previous_ctc', type: 'numeric', precision: 14, scale: 2 })
  previousCtc: string;

  @Column({ name: 'new_ctc', type: 'numeric', precision: 14, scale: 2 })
  newCtc: string;

  @Column({
    name: 'increment_pct',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  incrementPct: string | null;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId: string | null;

  @Column({
    name: 'revision_letter_path',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  revisionLetterPath: string | null;

  /** JSON snapshot of new component breakdown */
  @Column({ name: 'component_snapshot', type: 'jsonb', nullable: true })
  componentSnapshot: Record<string, any> | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
