import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'employee_generated_forms' })
@Index(['employeeId', 'formType'])
export class EmployeeGeneratedFormEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Index()
  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ name: 'form_type', type: 'varchar', length: 30 })
  formType: string; // PF, ESI, GRATUITY, INSURANCE, SALARY

  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'file_path', type: 'text' })
  filePath: string;

  @Column({ name: 'file_size', type: 'bigint', default: 0 })
  fileSize: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'DRAFT' })
  status: string; // DRAFT, FINAL

  @Column({ name: 'generated_by', type: 'uuid', nullable: true })
  generatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
