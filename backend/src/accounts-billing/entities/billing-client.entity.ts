import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { BillingFrequency } from '../enums';
import { Invoice } from './invoice.entity';

@Entity('billing_clients')
export class BillingClient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string;

  @Column({ name: 'billing_code', length: 50, unique: true })
  billingCode: string;

  @Column({ name: 'legal_name', length: 200 })
  legalName: string;

  @Column({ name: 'trade_name', length: 200, nullable: true })
  tradeName: string;

  @Column({ name: 'contact_person', length: 150, nullable: true })
  contactPerson: string;

  @Column({ name: 'billing_email', length: 200 })
  billingEmail: string;

  @Column({ name: 'cc_email', type: 'text', nullable: true })
  ccEmail: string;

  @Column({ length: 20, nullable: true })
  mobile: string;

  @Column({ name: 'gst_applicable', type: 'boolean', default: true })
  gstApplicable: boolean;

  @Column({ length: 20, nullable: true })
  gstin: string;

  @Column({ length: 20, nullable: true })
  pan: string;

  @Column({ name: 'place_of_supply', length: 100, nullable: true })
  placeOfSupply: string;

  @Column({ name: 'state_name', length: 100 })
  stateName: string;

  @Column({ name: 'state_code', length: 10 })
  stateCode: string;

  @Column({
    name: 'default_gst_rate',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 18,
  })
  defaultGstRate: number;

  @Column({ name: 'default_sac_code', length: 20, nullable: true })
  defaultSacCode: string;

  @Column({ name: 'payment_terms_days', type: 'int', default: 30 })
  paymentTermsDays: number;

  @Column({
    name: 'billing_frequency',
    type: 'enum',
    enum: BillingFrequency,
    enumName: 'billing_frequency',
    default: BillingFrequency.MONTHLY,
  })
  billingFrequency: BillingFrequency;

  @Column({ name: 'billing_address', type: 'text' })
  billingAddress: string;

  @Column({ length: 30, default: 'ACTIVE' })
  status: string;

  @OneToMany(() => Invoice, (invoice) => invoice.billingClient)
  invoices: Invoice[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
