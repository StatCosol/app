import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('registers_records')
@Index('idx_rr_client', ['clientId'])
export class RegistersRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'client_id' })
  clientId: string;

  @Column({ type: 'uuid', name: 'branch_id', nullable: true })
  branchId: string | null;

  @Column({ type: 'uuid', name: 'payroll_input_id', nullable: true })
  payrollInputId: string | null;

  @Column({ type: 'varchar', length: 20 })
  category: string; // REGISTER | RECORD

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'int', name: 'period_year', nullable: true })
  periodYear: number | null;

  @Column({ type: 'int', name: 'period_month', nullable: true })
  periodMonth: number | null;

  @Column({ type: 'uuid', name: 'prepared_by_user_id' })
  preparedByUserId: string;

  @Column({ type: 'varchar', length: 255, name: 'file_name' })
  fileName: string;

  @Column({ type: 'text', name: 'file_path' })
  filePath: string;

  @Column({ type: 'varchar', length: 120, name: 'file_type' })
  fileType: string;

  @Column({ type: 'bigint', name: 'file_size' })
  fileSize: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
