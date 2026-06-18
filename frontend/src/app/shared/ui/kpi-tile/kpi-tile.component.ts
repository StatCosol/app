import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export type KpiTileColor = 'amber' | 'blue' | 'red' | 'violet' | 'green' | 'gray' | 'emerald';

@Component({
  selector: 'ui-kpi-tile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div
      class="bg-white rounded-2xl p-5 flex items-start gap-4 border border-slate-100 shadow-sm
             transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
      [class.cursor-pointer]="hasClickListener"
      [class.cursor-default]="!hasClickListener"
      [ngClass]="accentClass"
      (click)="hasClickListener && tileClick.emit()">

      <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
           [ngClass]="iconBgClass">
        <ng-content select="[slot=icon]"></ng-content>
      </div>

      <div class="flex-1 min-w-0">
        <div class="text-xs font-semibold text-slate-500 uppercase tracking-wider">{{ label }}</div>
        <div class="text-3xl font-extrabold text-slate-800 leading-tight my-1"
             [ngClass]="valueColorClass">{{ value }}</div>
        <div *ngIf="detail" class="text-sm text-slate-500">{{ detail }}</div>
        <div class="text-sm text-slate-500"><ng-content select="[slot=detail]"></ng-content></div>
      </div>
    </div>
  `,
})
export class KpiTileComponent {
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() color: KpiTileColor = 'blue';
  @Input() detail = '';
  @Input() valueColor: KpiTileColor | '' = '';
  @Output() tileClick = new EventEmitter<void>();

  get hasClickListener(): boolean {
    return this.tileClick.observed;
  }

  get accentClass(): string {
    const map: Record<KpiTileColor, string> = {
      amber:   'border-l-4 border-l-amber-400',
      blue:    'border-l-4 border-l-blue-500',
      red:     'border-l-4 border-l-red-500',
      violet:  'border-l-4 border-l-violet-500',
      green:   'border-l-4 border-l-green-500',
      gray:    'border-l-4 border-l-slate-400',
      emerald: 'border-l-4 border-l-emerald-500',
    };
    return map[this.color];
  }

  get iconBgClass(): string {
    const map: Record<KpiTileColor, string> = {
      amber:   'bg-amber-100',
      blue:    'bg-blue-100',
      red:     'bg-red-100',
      violet:  'bg-violet-100',
      green:   'bg-green-100',
      gray:    'bg-slate-100',
      emerald: 'bg-emerald-100',
    };
    return map[this.color];
  }

  get valueColorClass(): string {
    if (!this.valueColor) return '';
    const map: Record<KpiTileColor, string> = {
      amber:   'text-amber-700',
      blue:    'text-blue-700',
      red:     'text-red-600',
      violet:  'text-violet-700',
      green:   'text-green-700',
      gray:    'text-slate-600',
      emerald: 'text-emerald-700',
    };
    return map[this.valueColor];
  }
}
