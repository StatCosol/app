import { Routes } from '@angular/router';
import { roleGuard } from '../../core/role.guard';

const AccountsLayoutComponent = () =>
  import('./accounts-layout/accounts-layout.component').then((m) => m.AccountsLayoutComponent);

/* Accounts & Billing pages (shared module) */
const BillingDashboardComponent = () =>
  import('../../modules/accounts-billing/pages/billing-dashboard.component').then((m) => m.BillingDashboardComponent);
const BillingClientsComponent = () =>
  import('../../modules/accounts-billing/pages/billing-clients.component').then((m) => m.BillingClientsComponent);
const BillingInvoicesComponent = () =>
  import('../../modules/accounts-billing/pages/billing-invoices.component').then((m) => m.BillingInvoicesComponent);
const BillingCreateInvoiceComponent = () =>
  import('../../modules/accounts-billing/pages/billing-create-invoice.component').then((m) => m.BillingCreateInvoiceComponent);
const BillingInvoiceViewComponent = () =>
  import('../../modules/accounts-billing/pages/billing-invoice-view.component').then((m) => m.BillingInvoiceViewComponent);
const BillingPaymentsComponent = () =>
  import('../../modules/accounts-billing/pages/billing-payments.component').then((m) => m.BillingPaymentsComponent);
const BillingGstReportComponent = () =>
  import('../../modules/accounts-billing/pages/billing-gst-report.component').then((m) => m.BillingGstReportComponent);
const BillingEmailLogsComponent = () =>
  import('../../modules/accounts-billing/pages/billing-email-logs.component').then((m) => m.BillingEmailLogsComponent);
const BillingSettingsComponent = () =>
  import('../../modules/accounts-billing/pages/billing-settings.component').then((m) => m.BillingSettingsComponent);

export const ACCOUNTS_ROUTES: Routes = [
  {
    path: 'accounts',
    loadComponent: AccountsLayoutComponent,
    canActivate: [roleGuard(['ACCOUNTS', 'ADMIN'])],
    children: [
      { path: 'dashboard', loadComponent: BillingDashboardComponent },
      { path: 'clients', loadComponent: BillingClientsComponent },
      { path: 'invoices', loadComponent: BillingInvoicesComponent },
      { path: 'invoices/new', loadComponent: BillingCreateInvoiceComponent },
      { path: 'invoices/:id', loadComponent: BillingInvoiceViewComponent },
      { path: 'payments', loadComponent: BillingPaymentsComponent },
      { path: 'gst-summary', loadComponent: BillingGstReportComponent },
      { path: 'email-logs', loadComponent: BillingEmailLogsComponent },
      { path: 'settings', loadComponent: BillingSettingsComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];
