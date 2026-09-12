import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ContractorPayrollWorkflowComponent } from './contractor-payroll-workflow.component';

@Component({
  standalone: true,
  selector: 'app-contractor-payroll-oversight',
  imports: [FormsModule, ContractorPayrollWorkflowComponent],
  template: `
    <details class="border rounded-lg p-4 my-4">
      <summary>Contractor payroll — approved packs and controlled reopening</summary>
      <p>
        Select a company to review approved contractor payroll or authorize a correction. CRM and
        auditor approval will be required again after recalculation.
      </p>
      @if (error()) {
        <p role="alert">{{ error() }}</p>
        <button type="button" (click)="loadClients()">Retry</button>
      }
      <label
        >Company
        <select [(ngModel)]="clientId">
          <option value="">Select company</option>
          @for (client of clients(); track client.id) {
            <option [value]="client.id">{{ client.clientName }}</option>
          }
        </select></label
      >
      <label>Period <input type="month" [(ngModel)]="periodMonth" /></label>
      @if (clientId) {
        <app-contractor-payroll-workflow [clientId]="clientId" [periodMonth]="periodMonth" />
      }
    </details>
  `,
})
export class ContractorPayrollOversightComponent implements OnInit, OnDestroy {
  clients = signal<{ id: string; clientName: string }[]>([]);
  error = signal('');
  clientId = '';
  periodMonth = new Date().toISOString().slice(0, 7);
  private request?: Subscription;
  constructor(private readonly http: HttpClient) {}
  ngOnInit(): void {
    this.loadClients();
  }
  ngOnDestroy(): void {
    this.request?.unsubscribe();
  }
  loadClients(): void {
    this.request?.unsubscribe();
    this.error.set('');
    this.request = this.http
      .get<{ id: string; clientName: string }[]>('/api/v1/contractor-payroll/versions/clients')
      .subscribe({
        next: (clients) => this.clients.set(clients),
        error: () => this.error.set('Could not load company options.'),
      });
  }
}
