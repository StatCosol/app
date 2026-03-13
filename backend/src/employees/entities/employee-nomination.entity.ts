import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'employee_nominations' })
export class EmployeeNominationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  @Index()
  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Index()
  @Column({ name: 'nomination_type', type: 'varchar', length: 30 })
  nominationType: 'PF' | 'ESI' | 'GRATUITY' | 'INSURANCE' | 'SALARY';

  @Column({ name: 'declaration_date', type: 'date', nullable: true })
  declarationDate: string | null;

  @Column({
    name: 'witness_name',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  witnessName: string | null;

  @Column({ name: 'witness_address', type: 'text', nullable: true })
  witnessAddress: string | null;

  @Column({ name: 'status', type: 'varchar', length: 30, default: 'DRAFT' })
  status: string;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Index()
  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId: string | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
