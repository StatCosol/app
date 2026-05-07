import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { LeadPriority, LeadSource, LeadStage } from '../enums/lead.enums';

@Entity('leads')
export class LeadEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'lead_no',
    type: 'varchar',
    length: 40,
    unique: true,
    nullable: true,
  })
  leadNo: string | null;

  @Column({ name: 'company_name', type: 'varchar', length: 200 })
  companyName: string;

  @Column({
    name: 'contact_name',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  contactName: string | null;

  @Column({
    name: 'contact_email',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  contactEmail: string | null;

  @Column({
    name: 'contact_phone',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  contactPhone: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  designation: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  industry: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city: string | null;

  @Column({ name: 'employee_count', type: 'int', nullable: true })
  employeeCount: number | null;

  @Index()
  @Column({
    type: 'enum',
    enum: LeadSource,
    enumName: 'lead_source',
    default: LeadSource.OTHER,
  })
  source: LeadSource;

  @Column({
    name: 'source_detail',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  sourceDetail: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: LeadStage,
    enumName: 'lead_stage',
    default: LeadStage.NEW,
  })
  stage: LeadStage;

  @Index()
  @Column({
    type: 'enum',
    enum: LeadPriority,
    enumName: 'lead_priority',
    default: LeadPriority.MEDIUM,
  })
  priority: LeadPriority;

  @Column({
    name: 'estimated_value',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  estimatedValue: string;

  @Column({ type: 'smallint', default: 20 })
  probability: number;

  @Column({ name: 'expected_close_date', type: 'date', nullable: true })
  expectedCloseDate: string | null;

  @Index()
  @Column({ name: 'next_followup_at', type: 'timestamptz', nullable: true })
  nextFollowupAt: Date | null;

  @Column({ name: 'last_activity_at', type: 'timestamptz', nullable: true })
  lastActivityAt: Date | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Index()
  @Column({ name: 'owner_user_id', type: 'uuid', nullable: true })
  ownerUserId: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({ name: 'converted_client_id', type: 'uuid', nullable: true })
  convertedClientId: string | null;

  @Column({ name: 'converted_at', type: 'timestamptz', nullable: true })
  convertedAt: Date | null;

  @Column({ name: 'lost_reason', type: 'varchar', length: 200, nullable: true })
  lostReason: string | null;

  @Column({ name: 'is_archived', type: 'boolean', default: false })
  isArchived: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
