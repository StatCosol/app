import {
  Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn,
} from 'typeorm';

@Entity('billing_settings')
export class BillingSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'legal_name', length: 250 })
  legalName: string;

  @Column({ name: 'trade_name', length: 250, nullable: true })
  tradeName: string;

  @Column({ length: 20 })
  gstin: string;

  @Column({ length: 20 })
  pan: string;

  @Column({ type: 'text' })
  address: string;

  @Column({ name: 'state_code', length: 10 })
  stateCode: string;

  @Column({ name: 'state_name', length: 100 })
  stateName: string;

  @Column({ length: 200, nullable: true })
  email: string;

  @Column({ length: 30, nullable: true })
  phone: string;

  @Column({ name: 'bank_account_name', length: 200, nullable: true })
  bankAccountName: string;

  @Column({ name: 'bank_name', length: 150, nullable: true })
  bankName: string;

  @Column({ name: 'account_number', length: 50, nullable: true })
  accountNumber: string;

  @Column({ name: 'ifsc_code', length: 20, nullable: true })
  ifscCode: string;

  @Column({ name: 'branch_name', length: 150, nullable: true })
  branchName: string;

  @Column({ name: 'invoice_prefix', length: 20, default: 'STS/INV' })
  invoicePrefix: string;

  @Column({ name: 'proforma_prefix', length: 20, default: 'STS/PI' })
  proformaPrefix: string;

  @Column({ name: 'credit_note_prefix', length: 20, default: 'STS/CN' })
  creditNotePrefix: string;

  @Column({ name: 'financial_year_format', length: 30, default: 'YYYY-YY' })
  financialYearFormat: string;

  @Column({ name: 'default_gst_rate', type: 'numeric', precision: 5, scale: 2, default: 18 })
  defaultGstRate: number;

  @Column({ name: 'default_payment_terms_days', type: 'int', default: 30 })
  defaultPaymentTermsDays: number;

  @Column({ name: 'default_sac_code', length: 20, nullable: true })
  defaultSacCode: string;

  @Column({ name: 'authorized_signatory_name', length: 150, nullable: true })
  authorizedSignatoryName: string;

  @Column({ name: 'authorized_signatory_designation', length: 100, nullable: true })
  authorizedSignatoryDesignation: string;

  @Column({ name: 'terms_and_conditions', type: 'text', nullable: true })
  termsAndConditions: string;

  @Column({ name: 'notes_footer', type: 'text', nullable: true })
  notesFooter: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
