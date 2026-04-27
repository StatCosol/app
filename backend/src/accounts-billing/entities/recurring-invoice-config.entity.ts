import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BillingFrequency } from '../enums';
import { BillingClient } from './billing-client.entity';

@Entity('recurring_invoice_configs')
export class RecurringInvoiceConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'billing_client_id', type: 'uuid' })
  billingClientId: string;

  @ManyToOne(() => BillingClient)
  @JoinColumn({ name: 'billing_client_id' })
  billingClient: BillingClient;

  @Column({ name: 'invoice_name', length: 150 })
  invoiceName: string;

  @Column({
    type: 'enum',
    enum: BillingFrequency,
    enumName: 'billing_frequency',
    default: BillingFrequency.MONTHLY,
  })
  frequency: BillingFrequency;

  @Column({ name: 'service_description', type: 'text' })
  serviceDescription: string;

  @Column({ name: 'default_amount', type: 'numeric', precision: 14, scale: 2 })
  defaultAmount: number;

  @Column({
    name: 'default_gst_rate',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 18,
  })
  defaultGstRate: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string;

  @Column({ name: 'next_run_date', type: 'date' })
  nextRunDate: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
