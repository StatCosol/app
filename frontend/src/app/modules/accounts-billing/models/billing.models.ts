export interface BillingClient {
  id: string;
  billingCode: string;
  legalName: string;
  tradeName?: string;
  contactPerson?: string;
  billingEmail: string;
  ccEmail?: string;
  mobile?: string;
  gstApplicable: boolean;
  gstin?: string;
  pan?: string;
  placeOfSupply?: string;
  stateName: string;
  stateCode: string;
  defaultGstRate: number;
  defaultSacCode?: string;
  paymentTermsDays: number;
  billingFrequency: string;
  billingAddress: string;
  status: string;
  createdAt: string;
}

export interface InvoiceItem {
  id?: string;
  serviceCode?: string;
  serviceDescription: string;
  sacCode?: string;
  periodFrom?: string;
  periodTo?: string;
  quantity: number;
  rate: number;
  amount?: number;
  discountAmount?: number;
  taxableAmount?: number;
  gstRate?: number;
  gstAmount?: number;
  lineTotal?: number;
  isReimbursement?: boolean;
  sequence?: number;
}

export interface Invoice {
  id: string;
  invoiceType: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  financialYear: string;
  placeOfSupply?: string;
  stateCode?: string;
  gstin?: string;
  subTotal: number;
  discountTotal: number;
  taxableValue: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  roundOff: number;
  grandTotal: number;
  amountReceived: number;
  balanceOutstanding: number;
  invoiceStatus: string;
  paymentStatus: string;
  mailStatus: string;
  remarks?: string;
  pdfPath?: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  billingClient?: BillingClient;
  items?: InvoiceItem[];
  payments?: InvoicePayment[];
}

export interface InvoicePayment {
  id: string;
  receiptNumber: string;
  paymentDate: string;
  amountReceived: number;
  tdsAmount: number;
  otherDeduction: number;
  netReceived: number;
  paymentMode: string;
  referenceNumber?: string;
  bankName?: string;
  remarks?: string;
  createdAt: string;
  invoice?: Invoice;
}

export interface InvoiceEmailLog {
  id: string;
  invoiceId: string;
  toEmail: string;
  ccEmail?: string;
  subject: string;
  sentStatus: string;
  sentAt?: string;
  failureReason?: string;
  invoice?: Invoice;
}

export interface BillingSetting {
  id: string;
  legalName: string;
  tradeName?: string;
  gstin: string;
  pan: string;
  address: string;
  stateCode: string;
  stateName: string;
  email?: string;
  phone?: string;
  bankAccountName?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  branchName?: string;
  invoicePrefix: string;
  proformaPrefix: string;
  creditNotePrefix: string;
  defaultGstRate: number;
  defaultPaymentTermsDays: number;
  defaultSacCode?: string;
  authorizedSignatoryName?: string;
  authorizedSignatoryDesignation?: string;
  termsAndConditions?: string;
  notesFooter?: string;
}

export interface DashboardStats {
  totalInvoices: number;
  draftCount: number;
  approvedCount: number;
  pendingPaymentCount: number;
  paidCount: number;
  overdueCount: number;
  totalBilled: number;
  totalReceived: number;
  totalOutstanding: number;
}

export interface PagedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const INVOICE_TYPES = [
  { value: 'PROFORMA', label: 'Proforma Invoice' },
  { value: 'TAX_INVOICE', label: 'Tax Invoice' },
  { value: 'CREDIT_NOTE', label: 'Credit Note' },
  { value: 'DEBIT_NOTE', label: 'Debit Note' },
  { value: 'REIMBURSEMENT', label: 'Reimbursement' },
];

export const INVOICE_STATUSES = [
  'DRAFT', 'APPROVED', 'GENERATED', 'EMAILED',
  'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED',
];

export const PAYMENT_MODES = [
  'CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'DD', 'NEFT', 'RTGS', 'IMPS',
];

export const BILLING_FREQUENCIES = [
  { value: 'ONE_TIME', label: 'One Time' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'HALF_YEARLY', label: 'Half Yearly' },
  { value: 'YEARLY', label: 'Yearly' },
];

export const INDIAN_STATES = [
  { code: '01', name: 'Jammu & Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh (Old)' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman & Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
];
