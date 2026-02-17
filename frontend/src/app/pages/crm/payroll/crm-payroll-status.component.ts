import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { PageHeaderComponent } from '../../../shared/ui';

@Component({
  standalone: true,
  selector: 'app-crm-payroll-status',
  imports: [CommonModule, PageHeaderComponent],
  template: `
    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header title="Payroll Status" description="Payroll processing status for assigned clients"></ui-page-header>

      <div class="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
        <div class="text-3xl mb-3">💰</div>
        <h3 class="text-lg font-semibold text-blue-900 mb-2">Payroll Data Not Available</h3>
        <p class="text-sm text-blue-700">
          Payroll processing is managed by the Payroll team. Contact your Admin or Payroll operator for payroll status updates regarding your assigned clients.
        </p>
      </div>
    </main>
  `,
})
export class CrmPayrollStatusComponent {}
