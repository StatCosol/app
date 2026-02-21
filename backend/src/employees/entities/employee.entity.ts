import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'employees' })
@Index(['clientId', 'employeeCode'], { unique: true })
export class EmployeeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Index()
  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Index()
  @Column({ name: 'employee_code', type: 'varchar', length: 50 })
  employeeCode: string;

  @Column({ name: 'first_name', type: 'varchar', length: 120 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 120, nullable: true })
  lastName: string | null;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ name: 'gender', type: 'varchar', length: 10, nullable: true })
  gender: string | null;

  @Column({ name: 'father_name', type: 'varchar', length: 200, nullable: true })
  fatherName: string | null;

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

  @Column({ name: 'date_of_joining', type: 'date', nullable: true })
  dateOfJoining: string | null;

  @Column({ name: 'date_of_exit', type: 'date', nullable: true })
  dateOfExit: string | null;

  @Column({ name: 'state_code', type: 'varchar', length: 10, nullable: true })
  stateCode: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
