import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComplianceCalendarItem } from '../../../core/models/returns.models';

interface CalendarDay {
  date: string;
  dayNum: number;
  isToday: boolean;
  isCurrentMonth: boolean;
  items: ComplianceCalendarItem[];
}

@Component({
  selector: 'ui-compliance-calendar-widget',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cal-widget">
      <div class="cal-header">
        <button type="button" class="cal-nav" (click)="prevMonth()">&laquo;</button>
        <span class="cal-title">{{ monthLabel }}</span>
        <button type="button" class="cal-nav" (click)="nextMonth()">&raquo;</button>
      </div>

      <div class="cal-grid">
        <div class="cal-dow" *ngFor="let d of dows">{{ d }}</div>
        <div
          *ngFor="let day of days"
          class="cal-day"
          [class.cal-day--today]="day.isToday"
          [class.cal-day--dim]="!day.isCurrentMonth"
          [class.cal-day--has]="day.items.length > 0"
          (click)="selectDay(day)"
        >
          <span class="cal-day-num">{{ day.dayNum }}</span>
          <span *ngIf="day.items.length" class="cal-dot"
                [class.cal-dot--red]="hasOverdue(day)"
                [class.cal-dot--amber]="!hasOverdue(day) && hasProofPending(day)"
                [class.cal-dot--green]="!hasOverdue(day) && !hasProofPending(day)">
          </span>
        </div>
      </div>

      <div *ngIf="selectedDay && selectedDay.items.length" class="cal-detail">
        <p class="cal-detail-date">{{ selectedDay.date }}</p>
        <div *ngFor="let item of selectedDay.items" class="cal-item">
          <span class="cal-item-badge"
                [class.bg-red-100]="item.status === 'OVERDUE'"
                [class.text-red-700]="item.status === 'OVERDUE'"
                [class.bg-amber-100]="item.proofPending"
                [class.text-amber-700]="item.proofPending && item.status !== 'OVERDUE'"
                [class.bg-green-100]="item.status === 'VERIFIED'"
                [class.text-green-700]="item.status === 'VERIFIED'"
                [class.bg-blue-100]="item.status !== 'OVERDUE' && item.status !== 'VERIFIED' && !item.proofPending"
                [class.text-blue-700]="item.status !== 'OVERDUE' && item.status !== 'VERIFIED' && !item.proofPending"
          >{{ item.itemType }}</span>
          <span class="cal-item-title">{{ item.title }}</span>
          <span class="cal-item-status text-xs ml-auto">{{ item.status }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .cal-widget { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
    .cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .cal-title { font-weight: 700; font-size: 14px; color: #0f172a; }
    .cal-nav { background: none; border: none; font-size: 16px; cursor: pointer; color: #64748b; padding: 4px 8px; border-radius: 6px; }
    .cal-nav:hover { background: #f1f5f9; }
    .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; }
    .cal-dow { font-size: 10px; font-weight: 600; color: #94a3b8; padding: 4px 0; }
    .cal-day { position: relative; padding: 6px 2px; font-size: 12px; cursor: pointer; border-radius: 6px; min-height: 32px; display: flex; flex-direction: column; align-items: center; }
    .cal-day:hover { background: #f8fafc; }
    .cal-day--today { background: #eff6ff; font-weight: 700; }
    .cal-day--dim { color: #cbd5e1; }
    .cal-day--has { font-weight: 600; }
    .cal-day-num { line-height: 1; }
    .cal-dot { width: 5px; height: 5px; border-radius: 50%; margin-top: 2px; }
    .cal-dot--red { background: #ef4444; }
    .cal-dot--amber { background: #f59e0b; }
    .cal-dot--green { background: #10b981; }
    .cal-detail { margin-top: 12px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
    .cal-detail-date { font-size: 11px; color: #64748b; margin-bottom: 6px; font-weight: 600; }
    .cal-item { display: flex; align-items: center; gap: 6px; padding: 4px 0; font-size: 12px; }
    .cal-item-badge { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 4px; }
    .cal-item-title { color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
    .cal-item-status { color: #64748b; }
  `],
})
export class ComplianceCalendarWidgetComponent implements OnChanges {
  @Input() items: ComplianceCalendarItem[] = [];

  dows = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  days: CalendarDay[] = [];
  monthLabel = '';
  selectedDay: CalendarDay | null = null;

  private viewYear = new Date().getFullYear();
  private viewMonth = new Date().getMonth();

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['items']) {
      this.buildCalendar();
    }
  }

  prevMonth(): void {
    this.viewMonth--;
    if (this.viewMonth < 0) { this.viewMonth = 11; this.viewYear--; }
    this.selectedDay = null;
    this.buildCalendar();
  }

  nextMonth(): void {
    this.viewMonth++;
    if (this.viewMonth > 11) { this.viewMonth = 0; this.viewYear++; }
    this.selectedDay = null;
    this.buildCalendar();
  }

  selectDay(day: CalendarDay): void {
    this.selectedDay = day.items.length ? day : null;
    this.cdr.markForCheck();
  }

  hasOverdue(day: CalendarDay): boolean {
    return day.items.some(i => i.status === 'OVERDUE');
  }

  hasProofPending(day: CalendarDay): boolean {
    return day.items.some(i => i.proofPending);
  }

  private buildCalendar(): void {
    const y = this.viewYear;
    const m = this.viewMonth;
    this.monthLabel = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysInPrevMonth = new Date(y, m, 0).getDate();

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const itemMap = new Map<string, ComplianceCalendarItem[]>();
    for (const item of this.items) {
      if (!item.dueDate) continue;
      const key = item.dueDate.slice(0, 10);
      if (!itemMap.has(key)) itemMap.set(key, []);
      itemMap.get(key)!.push(item);
    }

    this.days = [];

    // Previous month padding
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const pm = m === 0 ? 12 : m;
      const py = m === 0 ? y - 1 : y;
      const dateStr = `${py}-${String(pm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      this.days.push({ date: dateStr, dayNum: d, isToday: false, isCurrentMonth: false, items: itemMap.get(dateStr) || [] });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      this.days.push({ date: dateStr, dayNum: d, isToday: dateStr === todayStr, isCurrentMonth: true, items: itemMap.get(dateStr) || [] });
    }

    // Next month padding
    const remaining = 42 - this.days.length;
    for (let d = 1; d <= remaining; d++) {
      const nm = m + 2 > 12 ? 1 : m + 2;
      const ny = m + 2 > 12 ? y + 1 : y;
      const dateStr = `${ny}-${String(nm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      this.days.push({ date: dateStr, dayNum: d, isToday: false, isCurrentMonth: false, items: itemMap.get(dateStr) || [] });
    }

    this.cdr.markForCheck();
  }
}
