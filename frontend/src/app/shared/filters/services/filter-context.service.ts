import { Injectable } from '@angular/core';
import { FilterState } from '../models/filter.model';

/**
 * Persists filter selections per module key in localStorage.
 * Provides sensible defaults for month and financial year.
 */
@Injectable({ providedIn: 'root' })
export class FilterContextService {
  private readonly prefix = 'statcompy.filters.';

  get(key: string): Partial<FilterState> {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  set(key: string, state: Partial<FilterState>): void {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(state));
    } catch { /* quota errors silently ignored */ }
  }

  clear(key: string): void {
    localStorage.removeItem(this.prefix + key);
  }

  /** Current month in YYYY-MM format */
  defaultMonth(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  /**
   * Current Indian financial year string.
   * India FY runs Apr–Mar.  Mar 2026 → FY 2025-26, Apr 2026 → FY 2026-27
   */
  defaultFY(): string {
    const d = new Date();
    const month = d.getMonth(); // 0-based (Jan=0, Apr=3)
    const year = month >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    const next = (year + 1) % 100;
    return `FY ${year}-${String(next).padStart(2, '0')}`;
  }

  /** Generate a list of FY options for the last N years */
  fyOptions(count = 5): string[] {
    const d = new Date();
    const currentStartYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    const list: string[] = [];
    for (let i = 0; i < count; i++) {
      const y = currentStartYear - i;
      const n = (y + 1) % 100;
      list.push(`FY ${y}-${String(n).padStart(2, '0')}`);
    }
    return list;
  }
}
