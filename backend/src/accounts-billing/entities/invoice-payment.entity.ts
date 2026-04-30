import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PaymentMode } from '../enums';
import { Invoice } from './invoice.entity';

@Entity('invoice_payments')
export class InvoicePayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId: string;

  @ManyToOne(() => Invoice, (inv) => inv.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ name: 'receipt_number', length: 50 })
  receiptNumber: string;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate: string;

  @Column({
    name: 'amount_received',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  amountReceived: number;

  @Column({
    name: 'tds_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  tdsAmount: number;

  @Column({
    name: 'other_deduction',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  otherDeduction: number;

  @Column({
    name: 'net_received',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  netReceived: number;

  @Column({
    name: 'payment_mode',
    type: 'enum',
    enum: PaymentMode,
    enumName: 'payment_mode',
  })
  paymentMode: PaymentMode;

  @Column({ name: 'reference_number', length: 100, nullable: true })
  referenceNumber: string;

  @Column({ name: 'bank_name', length: 100, nullable: true })
  bankName: string;

  @Column({ type: 'text', nullable: true })
  remarks: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
