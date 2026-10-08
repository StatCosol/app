import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, Subscription } from 'rxjs';
import { IconComponent } from '../../shared/ui';
import { EffectiveComponent, PayrollEngineApiService, PayslipLayout, PayslipLayoutRow } from './payroll-engine-api.service';

@Component({
  selector: 'app-payslip-layout-editor',
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="layout-heading"><h2>Payslip Layout</h2><span aria-live="polite">{{ dirty ? 'Unsaved changes' : message }}</span></header>
    @if (error) { <p class="error" role="alert">{{ error }}</p> }
    @if (loading) { <p role="status">Loading payslip layout...</p> }
    @if (!layout && !loading) { <button type="button" (click)="load()" class="compact-action" title="Retry" aria-label="Retry" data-action-label="Retry" data-action-icon="refresh"><ui-icon name="refresh" [size]="20" /></button> }
    @if (layout; as current) {
      <form #form="ngForm" (ngSubmit)="save()">
        <fieldset [disabled]="loading || saving">
          <div class="toolbar">
            <label class="toggle"><input type="checkbox" name="enabled" [(ngModel)]="current.settings.enabled" (ngModelChange)="changed()">Custom layout enabled</label>
            <span class="currency">INR</span>
            <button type="button" class="icon-button" title="Discard changes and reload" aria-label="Discard changes and reload" (click)="load()"><ui-icon name="refresh" /></button>
            <button type="submit" class="standard-action primary" [disabled]="!dirty || form.invalid">{{ saving ? 'Saving...' : 'Save layout' }}</button>
          </div>
          @for (section of current.sections; track section.key; let s = $index) {
            <section class="layout-section" [attr.aria-label]="section.key">
              <label class="section-title">Section title<input required maxlength="80" [name]="'title-' + s" [(ngModel)]="section.title" (ngModelChange)="changed()"></label>
              <div class="row headings"><span>Component</span><span>Display label</span><span>Order</span></div>
              @for (row of section.rows; track $index; let i = $index) {
                <div class="row">
                  <span class="code">{{ row.type === 'COMPONENT' ? row.code : row.key }}</span>
                  <input required maxlength="80" [attr.aria-label]="'Label for ' + (row.type === 'COMPONENT' ? row.code : row.key)" [name]="'row-' + s + '-' + i" [(ngModel)]="row.label" (ngModelChange)="changed()">
                  <div class="row-actions">
                    <button type="button" class="icon-button up" title="Move up" aria-label="Move up" [disabled]="i === 0" (click)="move(section.rows, i, -1)"><ui-icon name="chevron-right" /></button>
                    <button type="button" class="icon-button down" title="Move down" aria-label="Move down" [disabled]="i === section.rows.length - 1" (click)="move(section.rows, i, 1)"><ui-icon name="chevron-right" /></button>
                    @if (row.type === 'COMPONENT') {
                      <button type="button" class="compact-action icon-button" (click)="remove(section.rows, i)" title="Remove component" aria-label="Remove component" data-action-label="Remove component" data-action-icon="trash"><ui-icon name="trash" [size]="20" /></button>
                    }
                  </div>
                </div>
              }
              @for (total of section.totals || []; track $index; let t = $index) {
                <div class="row total"><span class="code">{{ total.type === 'TOTAL' ? total.key : total.code }}</span><input required maxlength="80" [attr.aria-label]="section.key + ' total label'" [name]="'total-' + s + '-' + t" [(ngModel)]="total.label" (ngModelChange)="changed()"><span></span></div>
              }
              <div class="add-row">
                <select [name]="'add-' + s" [(ngModel)]="selected[section.key]" [attr.aria-label]="'Add component to ' + section.key">
                  <option value="">Select component</option>
                  @for (component of available(); track component.code) { <option [value]="component.code">{{ component.name }} ({{ component.code }})</option> }
                </select>
                <button type="button" class="compact-action icon-button" [disabled]="!selected[section.key] || section.rows.length >= 50" (click)="add(section)" title="Add component" aria-label="Add component" data-action-label="Add component" data-action-icon="plus"><ui-icon name="plus" [size]="20" /></button>
              </div>
            </section>
          }
        </fieldset>
      </form>
    }
  `,
  styles: [`
    :host { display:block; color:#173d38; }
    .layout-heading,.toolbar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
    .layout-heading { justify-content:space-between; padding:12px 0; }
    h2 { font-size:20px; margin:0; }
    .layout-heading span,.currency { font-size:13px; color:#5b6876; }
    fieldset { border:0; padding:0; min-width:0; }
    .toolbar { padding:14px 0; border-bottom:1px solid #d8e2df; }
    .toggle { display:flex; align-items:center; gap:8px; flex:1; min-width:190px; }
    .toggle input { width:18px; height:18px; }
    .layout-section { padding:20px 0; border-bottom:1px solid #d8e2df; }
    .section-title { display:grid; gap:5px; max-width:400px; font-size:13px; margin-bottom:16px; }
    .row { display:grid; grid-template-columns:minmax(120px,1fr) minmax(120px,2fr) 120px; gap:12px; align-items:center; padding:8px 0; }
    .headings { color:#5b6876; font-size:12px; }
    .code { font-size:13px; overflow-wrap:anywhere; }
    input:not([type=checkbox]),select { width:100%; min-width:0; padding:9px; border:1px solid #baccc6; border-radius:4px; background:white; color:#173d38; }
    .row-actions,.add-row { display:flex; align-items:center; gap:4px; }
    .add-row { max-width:520px; margin-top:10px; gap:10px; }
    button { border:1px solid #baccc6; background:white; color:#173d38; border-radius:4px; padding:9px 14px; font-size:14px; }
    .icon-button { width:36px; height:36px; padding:8px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
    .up ui-icon { transform:rotate(-90deg); } .down ui-icon { transform:rotate(90deg); }
    .primary { background:#116956; color:white; border-color:#116956; }
    button:disabled { opacity:.45; cursor:not-allowed; }
    .error { color:#a62037; padding:12px 0; }
    .total { border-top:1px solid #edf1f0; font-weight:600; }
    @media(max-width:600px) { .row { grid-template-columns:minmax(0,1fr) 120px; gap:8px; } .row .code { grid-column:1/-1; } .headings { display:none; } .row input { grid-column:1; } }
  `],
})
export class PayslipLayoutEditorComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) clientId = '';
  layout: PayslipLayout | null = null;
  components: EffectiveComponent[] = [];
  selected: Record<string, string> = {};
  loading = false;
  saving = false;
  dirty = false;
  error = '';
  message = '';
  private loadRequest?: Subscription;
  private saveRequest?: Subscription;

  constructor(private api: PayrollEngineApiService, private cdr: ChangeDetectorRef) {}
  ngOnChanges(): void { this.load(); }
  ngOnDestroy(): void { this.loadRequest?.unsubscribe(); this.saveRequest?.unsubscribe(); }

  load(): void {
    this.loadRequest?.unsubscribe();
    this.saveRequest?.unsubscribe();
    this.layout = null; this.selected = {}; this.dirty = false; this.error = ''; this.message = ''; this.saving = false;
    if (!this.clientId) return;
    this.loading = true;
    this.loadRequest = forkJoin({ layout: this.api.getPayslipLayout(this.clientId), components: this.api.getEffectiveComponents(this.clientId) }).subscribe({
      next: ({ layout, components }) => {
        this.layout = structuredClone(layout);
        this.layout.settings = { ...layout.settings, enabled: layout.settings?.enabled === true };
        this.selected = Object.fromEntries(this.layout.sections.map(section => [section.key, '']));
        this.components = components.filter(c => c.enabled);
        this.loading = false; this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.error = 'Payslip layout could not be loaded.'; this.cdr.markForCheck(); },
    });
  }
  changed(): void { this.dirty = true; this.message = ''; }
  available(): EffectiveComponent[] {
    const used = new Set(this.layout?.sections.flatMap(s => s.rows.filter(r => r.type === 'COMPONENT').map(r => r.code)));
    return this.components.filter(c => !used.has(c.code));
  }
  add(section: PayslipLayout['sections'][number]): void {
    const component = this.available().find(c => c.code === this.selected[section.key]);
    if (!component || section.rows.length >= 50) return;
    section.rows.push({ type: 'COMPONENT', code: component.code, label: component.name.slice(0, 80) });
    this.selected[section.key] = ''; this.changed();
  }
  move(rows: PayslipLayoutRow[], index: number, offset: number): void {
    const target = index + offset;
    if (target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]]; this.changed();
  }
  remove(rows: PayslipLayoutRow[], index: number): void {
    if (rows[index]?.type !== 'COMPONENT') return;
    rows.splice(index, 1); this.changed();
  }
  save(): void {
    if (!this.layout || !this.dirty || this.saving || this.loading) return;
    this.saving = true; this.error = '';
    this.saveRequest = this.api.savePayslipLayout(this.clientId, structuredClone(this.layout)).subscribe({
      next: layout => { this.layout = structuredClone(layout); this.saving = false; this.dirty = false; this.message = 'Layout saved'; this.cdr.markForCheck(); },
      error: err => { this.saving = false; this.error = err?.error?.message || 'Payslip layout could not be saved.'; this.cdr.markForCheck(); },
    });
  }
}
