import {
  Component,
  Input,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnChanges,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';

import type { Chart, ChartType } from 'chart.js';

export interface ChartCardDataset {
  label?: string;
  data: number[];
  /** Optional explicit colors; the shared palette is used when omitted. */
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  fill?: boolean;
  tension?: number;
}

/** Shared categorical palette so charts look consistent across portals. */
const PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#0ea5e9', // sky
  '#f97316', // orange
  '#64748b', // slate
];

@Component({
  selector: 'ui-chart-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <div class="bg-white rounded-xl border border-gray-200 p-5 shadow-sm h-full flex flex-col">
      <div class="flex items-center justify-between mb-3">
        <div>
          <h3 class="text-base font-semibold text-gray-900">{{ title }}</h3>
          @if (subtitle) {
            <p class="text-xs text-gray-500 mt-0.5">{{ subtitle }}</p>
          }
        </div>
        <ng-content select="[slot=actions]"></ng-content>
      </div>

      @if (isEmpty) {
        <div class="flex-1 flex items-center justify-center text-sm text-gray-400 py-8">
          {{ emptyMessage }}
        </div>
      } @else {
        <div class="relative flex-1" [style.min-height.px]="height">
          <canvas #canvas></canvas>
        </div>
      }
    </div>
  `,
})
export class ChartCardComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) title = '';
  @Input() subtitle = '';
  @Input() type: ChartType = 'bar';
  @Input() labels: string[] = [];
  @Input() datasets: ChartCardDataset[] = [];
  @Input() height = 240;
  @Input() showLegend = true;
  @Input() emptyMessage = 'No data to display';
  /** Set for horizontal bar charts. */
  @Input() horizontal = false;

  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  private chart?: Chart;
  private viewReady = false;

  get isEmpty(): boolean {
    return !this.datasets.some((d) => d.data.some((v) => v !== 0));
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    void this.render();
  }

  ngOnChanges(): void {
    if (this.viewReady) void this.render();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private async render(): Promise<void> {
    this.chart?.destroy();
    this.chart = undefined;
    if (this.isEmpty) return;

    // chart.js is loaded lazily so portals without charts don't pay for it
    const { default: ChartJs } = await import('chart.js/auto');
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const isPie = this.type === 'doughnut' || this.type === 'pie' || this.type === 'polarArea';
    const datasets = this.datasets.map((d, i) => ({
      ...d,
      backgroundColor:
        d.backgroundColor ?? (isPie || this.datasets.length === 1 ? PALETTE : PALETTE[i % PALETTE.length]),
      borderColor: d.borderColor ?? (isPie ? '#ffffff' : PALETTE[i % PALETTE.length]),
    }));

    this.chart = new ChartJs(canvas, {
      type: this.type,
      data: { labels: this.labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: this.horizontal ? 'y' : 'x',
        plugins: {
          legend: {
            display: this.showLegend,
            position: isPie ? 'right' : 'top',
            labels: { boxWidth: 12, font: { size: 11 } },
          },
        },
        scales: isPie
          ? undefined
          : {
              x: { grid: { display: false }, ticks: { font: { size: 11 } } },
              y: { beginAtZero: true, ticks: { font: { size: 11 }, precision: 0 } },
            },
      },
    });
  }
}
