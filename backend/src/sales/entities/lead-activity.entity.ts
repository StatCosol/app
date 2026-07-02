import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { LeadActivityOutcome, LeadActivityType } from '../enums/lead.enums';

@Entity('lead_activities')
export class LeadActivityEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'lead_id', type: 'uuid' })
  leadId: string;

  @Index()
  @Column({
    name: 'activity_type',
    type: 'enum',
    enum: LeadActivityType,
    enumName: 'lead_activity_type',
  })
  activityType: LeadActivityType;

  @Column({
    type: 'enum',
    enum: LeadActivityOutcome,
    enumName: 'lead_activity_outcome',
    nullable: true,
  })
  outcome: LeadActivityOutcome | null;

  @Index()
  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  @Column({ name: 'next_followup_at', type: 'timestamptz', nullable: true })
  nextFollowupAt: Date | null;

  @Column({ name: 'duration_minutes', type: 'int', nullable: true })
  durationMinutes: number | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  subject: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Index()
  @Column({ name: 'performed_by', type: 'uuid', nullable: true })
  performedBy: string | null;

  @Column({
    name: 'attachment_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  attachmentUrl: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
