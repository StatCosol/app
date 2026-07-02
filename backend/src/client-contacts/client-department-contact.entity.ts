import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ClientContactDepartment =
  | 'ACCOUNTS'
  | 'COMPLIANCE'
  | 'CONTRACTOR_COMPLIANCE'
  | 'HR'
  | 'PAYROLL';

export const CLIENT_CONTACT_DEPARTMENTS: ClientContactDepartment[] = [
  'ACCOUNTS',
  'COMPLIANCE',
  'CONTRACTOR_COMPLIANCE',
  'HR',
  'PAYROLL',
];

@Entity({ name: 'client_department_contacts' })
@Index(['clientId', 'department'])
export class ClientDepartmentContactEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({
    name: 'department',
    type: 'enum',
    enum: ['ACCOUNTS', 'COMPLIANCE', 'CONTRACTOR_COMPLIANCE', 'HR', 'PAYROLL'],
    enumName: 'client_contact_department',
  })
  department: ClientContactDepartment;

  @Column({ name: 'name', type: 'varchar', length: 160 })
  name: string;

  @Column({ name: 'email', type: 'varchar', length: 160 })
  email: string;

  @Column({ name: 'phone', type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Column({ name: 'designation', type: 'varchar', length: 120, nullable: true })
  designation: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
