import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClientEntity } from '../../clients/entities/client.entity';
import { BranchEntity } from '../../branches/entities/branch.entity';
import { DepartmentEntity } from './department.entity';
import { GradeEntity } from './grade.entity';
import { DesignationEntity } from './designation.entity';

@Entity({ name: 'employees' })
@Index(['clientId', 'employeeCode'], { unique: true })
@Index('IDX_EMP_CLIENT_BRANCH', ['clientId', 'branchId'])
@Index('IDX_EMP_CLIENT_ACTIVE', ['clientId', 'isActive'])
@Index('IDX_EMP_APPROVAL', ['approvalStatus'])
@Index('IDX_EMP_AADHAAR', ['aadhaar'])
export class EmployeeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => ClientEntity, { eager: false })
  @JoinColumn({ name: 'client_id' })
  client?: ClientEntity;

  @Index()
  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @ManyToOne(() => BranchEntity, { eager: false })
  @JoinColumn({ name: 'branch_id' })
  branch?: BranchEntity;

  @Index()
  @Column({ name: 'employee_code', type: 'varchar', length: 50 })
  employeeCode: string;

  @Column({ name: 'name', type: 'varchar', length: 250 })
  name: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ name: 'gender', type: 'varchar', length: 10, nullable: true })
  gender: string | null;

  @Column({ name: 'father_name', type: 'varchar', length: 200, nullable: true })
  fatherName: string | null;

  @Column({ name: 'marital_status', type: 'varchar', length: 20, nullable: true })
  maritalStatus: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ name: 'email', type: 'varchar', length: 200, nullable: true })
  email: string | null;

  @Column({ name: 'aadhaar', type: 'varchar', length: 20, nullable: true })
  aadhaar: string | null;

  @Column({ name: 'pan', type: 'varchar', length: 20, nullable: true })
  pan: string | null;

  @Column({ name: 'uan', type: 'varchar', length: 30, nullable: true })
  uan: string | null;

  @Column({ name: 'esic', type: 'varchar', length: 30, nullable: true })
  esic: string | null;

  @Column({ name: 'pf_applicable', type: 'boolean', default: false })
  pfApplicable: boolean;

  @Column({ name: 'pf_registered', type: 'boolean', default: false })
  pfRegistered: boolean;

  @Column({ name: 'pf_applicable_from', type: 'date', nullable: true })
  pfApplicableFrom: string | null;

  @Column({ name: 'pf_service_start_date', type: 'date', nullable: true })
  pfServiceStartDate: string | null;

  @Column({ name: 'basic_at_pf_start', type: 'numeric', precision: 12, scale: 2, nullable: true })
  basicAtPfStart: number | null;

  @Column({ name: 'esi_applicable', type: 'boolean', default: false })
  esiApplicable: boolean;

  @Column({ name: 'esi_registered', type: 'boolean', default: false })
  esiRegistered: boolean;

  @Column({ name: 'esi_applicable_from', type: 'date', nullable: true })
  esiApplicableFrom: string | null;

  @Column({ name: 'bank_name', type: 'varchar', length: 200, nullable: true })
  bankName: string | null;

  @Column({ name: 'bank_account', type: 'varchar', length: 40, nullable: true })
  bankAccount: string | null;

  @Column({ name: 'ifsc', type: 'varchar', length: 20, nullable: true })
  ifsc: string | null;

  @Column({ name: 'designation', type: 'varchar', length: 120, nullable: true })
  designation: string | null;

  @Column({ name: 'department', type: 'varchar', length: 120, nullable: true })
  department: string | null;

  @Index()
  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @ManyToOne(() => DepartmentEntity, { eager: false })
  @JoinColumn({ name: 'department_id' })
  departmentRef?: DepartmentEntity;

  @Index()
  @Column({ name: 'grade_id', type: 'uuid', nullable: true })
  gradeId: string | null;

  @ManyToOne(() => GradeEntity, { eager: false })
  @JoinColumn({ name: 'grade_id' })
  grade?: GradeEntity;

  @Index()
  @Column({ name: 'designation_id', type: 'uuid', nullable: true })
  designationId: string | null;

  @ManyToOne(() => DesignationEntity, { eager: false })
  @JoinColumn({ name: 'designation_id' })
  designationRef?: DesignationEntity;

  @Column({ name: 'date_of_joining', type: 'date', nullable: true })
  dateOfJoining: string | null;

  @Column({ name: 'date_of_exit', type: 'date', nullable: true })
  dateOfExit: string | null;

  @Column({ name: 'exit_reason', type: 'varchar', length: 500, nullable: true })
  exitReason: string | null;

  @Column({ name: 'state_code', type: 'varchar', length: 10, nullable: true })
  stateCode: string | null;

  @Column({ name: 'ctc', type: 'numeric', precision: 12, scale: 2, nullable: true })
  ctc: number | null;

  @Column({ name: 'monthly_gross', type: 'numeric', precision: 12, scale: 2, nullable: true })
  monthlyGross: number | null;

  @Column({
    name: 'approval_status',
    type: 'varchar',
    length: 20,
    default: 'APPROVED',
  })
  approvalStatus: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
