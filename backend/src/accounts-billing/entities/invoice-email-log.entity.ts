import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Invoice } from './invoice.entity';
import { MailStatus } from '../enums/mail-status.enum';

@Entity('invoice_email_logs')
export class InvoiceEmailLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId: string;

  @ManyToOne(() => Invoice, (invoice) => invoice.emailLogs, {
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ name: 'to_email', type: 'text' })
  toEmail: string;

  @Column({ name: 'cc_email', type: 'text', nullable: true })
  ccEmail: string;

  @Column({ length: 250 })
  subject: string;

  @Column({ type: 'text', nullable: true })
  body: string;

  @Column({
    name: 'sent_status',
    type: 'enum',
    enum: MailStatus,
    default: MailStatus.NOT_SENT,
  })
  sentStatus: MailStatus;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'sent_by', type: 'uuid', nullable: true })
  sentBy: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
