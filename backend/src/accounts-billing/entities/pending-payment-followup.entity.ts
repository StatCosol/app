import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PendingPaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

@Entity('pending_payment_followups')
@Index('uq_pending_payment_followups_invoice', ['invoiceNumber'], {
  unique: true,
})
export class PendingPaymentFollowup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'invoice_number', length: 100 })
  invoiceNumber: string;

  @Column({ name: 'client_name', length: 250 })
  clientName: string;

  @Column({ name: 'client_email', length: 250 })
  clientEmail: string;

  @Column({ name: 'cc_email', type: 'varchar', length: 250, nullable: true })
  ccEmail: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: number;

  @Column({ name: 'invoice_date', type: 'date', nullable: true })
  invoiceDate: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({
    type: 'enum',
    enum: PendingPaymentStatus,
    enumName: 'pending_payment_status',
    default: PendingPaymentStatus.PENDING,
  })
  status: PendingPaymentStatus;

  @Column({ name: 'reminder_count', type: 'int', default: 0 })
  reminderCount: number;

  @Column({
    name: 'last_reminder_sent_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastReminderSentAt: Date | null;

  @Column({
    name: 'last_reminder_status',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  lastReminderStatus: string | null;

  @Column({ name: 'last_failure_reason', type: 'text', nullable: true })
  lastFailureReason: string | null;

  @Column({ name: 'reminders_paused', type: 'boolean', default: false })
  remindersPaused: boolean;

  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
  uploadedBy: string | null;

  @Column({ name: 'uploaded_at', type: 'timestamptz', default: () => 'NOW()' })
  uploadedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
