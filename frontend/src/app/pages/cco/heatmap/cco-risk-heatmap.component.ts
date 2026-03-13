import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageHeaderComponent } from '../../../shared/ui';
import { HeatmapComponent } from '../../../shared/risk/heatmap.component';

@Component({
  selector: 'app-cco-risk-heatmap',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, HeatmapComponent],
  template: `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <ui-page-header
        title="Risk Heatmap"
        subtitle="Organisation-wide compliance risk exposure by state and branch">
      </ui-page-header>

      <div class="mt-2">
        <app-risk-heatmap></app-risk-heatmap>
      </div>
    </div>
  `,
})
export class CcoRiskHeatmapComponent {}
