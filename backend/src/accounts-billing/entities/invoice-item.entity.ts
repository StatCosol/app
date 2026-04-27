import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Invoice } from './invoice.entity';

@Entity('invoice_items')
export class InvoiceItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId: string;

  @ManyToOne(() => Invoice, (inv) => inv.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ name: 'service_code', length: 50, nullable: true })
  serviceCode: string;

  @Column({ name: 'service_description', type: 'text' })
  serviceDescription: string;

  @Column({ name: 'sac_code', length: 20, nullable: true })
  sacCode: string;

  @Column({ name: 'period_from', type: 'date', nullable: true })
  periodFrom: string;

  @Column({ name: 'period_to', type: 'date', nullable: true })
  periodTo: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 1 })
  quantity: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  rate: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  amount: number;

  @Column({
    name: 'discount_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  discountAmount: number;

  @Column({
    name: 'taxable_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  taxableAmount: number;

  @Column({
    name: 'gst_rate',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  gstRate: number;

  @Column({
    name: 'gst_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  gstAmount: number;

  @Column({
    name: 'line_total',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
  })
  lineTotal: number;

  @Column({ name: 'is_reimbursement', type: 'boolean', default: false })
  isReimbursement: boolean;

  @Column({ type: 'int', default: 1 })
  sequence: number;
}
