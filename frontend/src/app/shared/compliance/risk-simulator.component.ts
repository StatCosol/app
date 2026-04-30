import { Component, Input, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientBranchesService } from '../../core/client-branches.service';

@Component({
  standalone: true,
  selector: 'app-risk-simulator',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div class="card">
    <div class="k">Inspection Simulation Mode</div>

    <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div>
        <label for="sim-completion">Completion %</label>
        <input autocomplete="off" type="number" id="sim-completion" name="completionPercent" [(ngModel)]="completionPercent" />
      </div>
      <div>
        <label for="sim-overdue">Overdue SLA</label>
        <input autocomplete="off" type="number" id="sim-overdue" name="overdueSla" [(ngModel)]="overdueSla" />
      </div>
      <div>
        <label for="sim-critical">High/Critical</label>
        <input autocomplete="off" type="number" id="sim-critical" name="highCritical" [(ngModel)]="highCritical" />
      </div>
      <div>
        <label>
          <input autocomplete="off" type="checkbox" id="sim-expiring" name="expiringRegistrations" [(ngModel)]="expiringRegistrations" />
          Expiring Registration
        </label>
      </div>
    </div>

    <button class="btn" style="margin-top:10px;" (click)="simulate()">Simulate</button>

    <div *ngIf="result" style="margin-top:10px;">
      <div class="v">{{ result.inspectionProbability }}%</div>
      <div class="muted">New inspection probability</div>
    </div>
  </div>
  `
})
export class RiskSimulatorComponent {
  @Input() branchId!: string;
  @Input() month!: string;

  completionPercent = 80;
  overdueSla = 0;
  highCritical = 0;
  expiringRegistrations = false;

  result: any;

  constructor(private api: ClientBranchesService, private cdr: ChangeDetectorRef) {}

  simulate() {
    this.api.simulateRisk({
      month: this.month,
      branchId: this.branchId,
      completionPercent: this.completionPercent,
      overdueSla: this.overdueSla,
      highCritical: this.highCritical,
      expiringRegistrations: this.expiringRegistrations
    }).subscribe({
      next: (res: any) => {
        this.result = res;
        this.cdr.markForCheck();
      }
    });
  }
}
