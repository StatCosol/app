import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'clients' })
export class ClientEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_code', type: 'varchar', length: 30, unique: true })
  clientCode: string;

  @Column({ name: 'client_name', type: 'varchar', length: 255 })
  clientName: string;

  @Column({ name: 'status', type: 'varchar', length: 30, nullable: true })
  status: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy: string | null;

  @Column({ name: 'delete_reason', type: 'text', nullable: true })
  deleteReason: string | null;

  @Column({ name: 'assigned_crm_id', type: 'uuid', nullable: true })
  assignedCrmId: string | null;

  @Column({ name: 'assigned_auditor_id', type: 'uuid', nullable: true })
  assignedAuditorId: string | null;

  @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true })
  logoUrl: string | null;

  @Column({ name: 'registered_address', type: 'text', nullable: true })
  registeredAddress: string | null;

  @Column({ name: 'state', type: 'varchar', length: 50, nullable: true })
  state: string | null;

  @Column({ name: 'industry', type: 'varchar', length: 100, nullable: true })
  industry: string | null;

  @Column({
    name: 'primary_contact_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  primaryContactName: string | null;

  @Column({
    name: 'primary_contact_email',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  primaryContactEmail: string | null;

  @Column({
    name: 'primary_contact_mobile',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  primaryContactMobile: string | null;

  @Column({ name: 'company_code', type: 'varchar', length: 30, nullable: true })
  companyCode: string | null;

  @Column({ name: 'crm_on_behalf_enabled', type: 'boolean', default: false })
  crmOnBehalfEnabled: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
