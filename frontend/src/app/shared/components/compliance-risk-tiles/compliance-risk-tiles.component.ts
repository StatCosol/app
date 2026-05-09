import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-compliance-risk-tiles',
  imports: [CommonModule],
  template: `
    <div class="risk-grid">
      <div class="risk-card">
        <h3>Top Overdue Returns</h3>
        <div *ngFor="let item of overdueReturns" class="risk-item">
          <div>{{ item.returnType || item.lawType || '-' }}</div>
          <div>{{ item.dueDate || '-' }}</div>
        </div>
        <div *ngIf="overdueReturns.length === 0" class="empty">No overdue returns</div>
      </div>

      <div class="risk-card">
        <h3>Filed Pending Proof</h3>
        <div *ngFor="let item of proofPendingReturns" class="risk-item">
          <div>{{ item.returnType || item.lawType || '-' }}</div>
          <div>{{ item.dueDate || '-' }}</div>
        </div>
        <div *ngIf="proofPendingReturns.length === 0" class="empty">No proof-pending returns</div>
      </div>

      <div class="risk-card">
        <h3>Top Overdue Renewals</h3>
        <div *ngFor="let item of overdueRenewals" class="risk-item">
          <div>{{ item.registrationName || item.name || '-' }}</div>
          <div>{{ item.dueDate || '-' }}</div>
        </div>
        <div *ngIf="overdueRenewals.length === 0" class="empty">No overdue renewals</div>
      </div>
    </div>
  `,
  styles: [
    `
      .risk-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
      }
      .risk-card {
        border: 1px solid #e5e5e5;
        border-radius: 10px;
        padding: 16px;
        background: #fff;
      }
      .risk-card h3 {
        margin: 0 0 10px;
        font-size: 14px;
        font-weight: 600;
      }
      .risk-item {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 0;
        border-bottom: 1px solid #f0f0f0;
        font-size: 13px;
      }
      .empty {
        color: #666;
        padding: 10px 0;
        font-size: 13px;
      }
    `,
  ],
})
export class ComplianceRiskTilesComponent implements OnChanges {
  @Input() returnTasks: any[] = [];
  @Input() expiryTasks: any[] = [];

  overdueReturns: any[] = [];
  proofPendingReturns: any[] = [];
  overdueRenewals: any[] = [];

  ngOnChanges(): void {
    this.overdueReturns = this.returnTasks
      .filter((x) => this.isOverdue(x))
      .slice(0, 5);

    this.proofPendingReturns = this.returnTasks
      .filter((x) => x.status === 'SUBMITTED' && !x.ackFilePath)
      .slice(0, 5);

    this.overdueRenewals = this.expiryTasks
      .filter((x) => this.isOverdue(x))
      .slice(0, 5);
  }

  private isOverdue(item: any): boolean {
    if (!item.dueDate) return false;
    if (item.status === 'APPROVED' || item.status === 'NOT_APPLICABLE') return false;
    const due = new Date(item.dueDate);
    if (isNaN(due.getTime())) return false;
    return due.getTime() < new Date().setHours(0, 0, 0, 0);
  }
}
