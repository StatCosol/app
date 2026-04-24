import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, JoinColumn,
} from 'typeorm';
import { InvoiceType, InvoiceStatus, PaymentStatus, MailStatus } from '../enums';
import { BillingClient } from './billing-client.entity';
import { InvoiceItem } from './invoice-item.entity';
import { InvoicePayment } from './invoice-payment.entity';
import { InvoiceEmailLog } from './invoice-email-log.entity';

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'billing_client_id', type: 'uuid' })
  billingClientId: string;

  @ManyToOne(() => BillingClient, (bc) => bc.invoices, {
    onDelete: 'RESTRICT',
    eager: false,
  })
  @JoinColumn({ name: 'billing_client_id' })
  billingClient: BillingClient;

  @Column({ name: 'invoice_type', type: 'enum', enum: InvoiceType, enumName: 'invoice_type' })
  invoiceType: InvoiceType;

  @Column({ name: 'invoice_number', length: 50, unique: true })
  invoiceNumber: string;

  @Column({ name: 'invoice_date', type: 'date' })
  invoiceDate: string;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({ name: 'financial_year', length: 20 })
  financialYear: string;

  @Column({ name: 'place_of_supply', length: 100, nullable: true })
  placeOfSupply: string;

  @Column({ name: 'state_code', length: 10, nullable: true })
  stateCode: string;

  @Column({ length: 20, nullable: true })
  gstin: string;

  @Column({ name: 'sub_total', type: 'numeric', precision: 14, scale: 2, default: 0 })
  subTotal: number;

  @Column({ name: 'discount_total', type: 'numeric', precision: 14, scale: 2, default: 0 })
  discountTotal: number;

  @Column({ name: 'taxable_value', type: 'numeric', precision: 14, scale: 2, default: 0 })
  taxableValue: number;

  @Column({ name: 'cgst_rate', type: 'numeric', precision: 5, scale: 2, default: 0 })
  cgstRate: number;

  @Column({ name: 'cgst_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  cgstAmount: number;

  @Column({ name: 'sgst_rate', type: 'numeric', precision: 5, scale: 2, default: 0 })
  sgstRate: number;

  @Column({ name: 'sgst_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  sgstAmount: number;

  @Column({ name: 'igst_rate', type: 'numeric', precision: 5, scale: 2, default: 0 })
  igstRate: number;

  @Column({ name: 'igst_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  igstAmount: number;

  @Column({ name: 'total_gst', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalGst: number;

  @Column({ name: 'round_off', type: 'numeric', precision: 14, scale: 2, default: 0 })
  roundOff: number;

  @Column({ name: 'grand_total', type: 'numeric', precision: 14, scale: 2, default: 0 })
  grandTotal: number;

  @Column({ name: 'amount_received', type: 'numeric', precision: 14, scale: 2, default: 0 })
  amountReceived: number;

  @Column({ name: 'balance_outstanding', type: 'numeric', precision: 14, scale: 2, default: 0 })
  balanceOutstanding: number;

  @Column({ name: 'invoice_status', type: 'enum', enum: InvoiceStatus, enumName: 'invoice_status', default: InvoiceStatus.DRAFT })
  invoiceStatus: InvoiceStatus;

  @Column({ name: 'payment_status', type: 'enum', enum: PaymentStatus, enumName: 'payment_status', default: PaymentStatus.UNPAID })
  paymentStatus: PaymentStatus;

  @Column({ name: 'mail_status', type: 'enum', enum: MailStatus, enumName: 'mail_status', default: MailStatus.NOT_SENT })
  mailStatus: MailStatus;

  @Column({ type: 'text', nullable: true })
  remarks: string;

  @Column({ name: 'pdf_path', type: 'text', nullable: true })
  pdfPath: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => InvoiceItem, (item) => item.invoice, { cascade: true, eager: true })
  items: InvoiceItem[];

  @OneToMany(() => InvoicePayment, (p) => p.invoice)
  payments: InvoicePayment[];

  @OneToMany(() => InvoiceEmailLog, (log) => log.invoice)
  emailLogs: InvoiceEmailLog[];
}
