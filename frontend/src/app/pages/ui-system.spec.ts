import { Component, ViewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { WorkspaceToolsComponent } from '../shared/components/workspace-tools/workspace-tools.component';
import { DataTableComponent } from '../shared/ui/data-table/data-table.component';
import { FormInputComponent } from '../shared/ui/form-input/form-input.component';
import { FormSelectComponent } from '../shared/ui/form-select/form-select.component';
import { ActionButtonComponent } from '../shared/ui/action-button/action-button.component';
import { ModalComponent } from '../shared/ui/modal/modal.component';

@Component({ standalone: true, imports: [WorkspaceToolsComponent], template: `<div class="workspace-ui"><aside><nav><a href="/client/dashboard">Dashboard</a><a href="/client/payroll">Payroll</a><a href="/client/payroll">Payroll duplicate</a><a href="/admin/users">Users</a><a href="https://example.com/client/help">External</a></nav></aside><app-workspace-tools /></div>` })
class WorkspaceHarness { @ViewChild(WorkspaceToolsComponent) tools!: WorkspaceToolsComponent; }

describe('Workspace UI interactions', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); localStorage.removeItem('statco.ui.density'); delete document.documentElement.dataset['uiDensity']; });
  async function workspace() {
    const router = { url: '/client/dashboard', navigateByUrl: vi.fn().mockResolvedValue(true) };
    await TestBed.configureTestingModule({ imports: [WorkspaceHarness], providers: [{ provide: Router, useValue: router }] }).compileComponents();
    const fixture = TestBed.createComponent(WorkspaceHarness); fixture.detectChanges();
    return { fixture, tools: fixture.componentInstance.tools, router };
  }
  it('finds only current-portal navigation and deduplicates destinations', async () => {
    const { tools } = await workspace(); tools.open();
    expect(tools.links().map(link => link.url)).toEqual(['/client/dashboard', '/client/payroll']);
    tools.query.set('  PAYROLL '); expect(tools.filtered()).toHaveLength(1);
    tools.close();
  });
  it('opens with the keyboard, focuses search, and restores the opener', async () => {
    const { fixture, tools } = await workspace();
    const trigger = fixture.nativeElement.querySelector('button'); trigger.focus();
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }); document.dispatchEvent(event); fixture.detectChanges();
    expect(event.defaultPrevented).toBe(true); expect(tools.finder.nativeElement.open).toBe(true);
    expect(document.activeElement).toBe(tools.search.nativeElement);
    tools.close(); tools.restoreFocus(); expect(document.activeElement).toBe(trigger);
  });
  it('keeps the finder open and explains a denied navigation', async () => {
    const { tools, router } = await workspace(); router.navigateByUrl.mockResolvedValue(false);
    tools.open(); await tools.navigate(tools.links()[0]); expect(tools.error()).toContain('unavailable'); expect(tools.finder.nativeElement.open).toBe(true); tools.close();
  });
  it('does not hijack shortcuts when another dialog is open', async () => {
    const { tools } = await workspace(); const other = document.createElement('div'); other.setAttribute('role', 'dialog'); document.body.append(other);
    try { tools.shortcut(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })); expect(tools.finder.nativeElement.open).toBe(false); } finally { other.remove(); }
  });
  it('persists density without storing user data', async () => {
    const { tools } = await workspace(); tools.toggleDensity();
    expect(document.documentElement.dataset['uiDensity']).toBe('compact'); expect(localStorage.getItem('statco.ui.density')).toBe('compact');
    tools.toggleDensity(); expect(document.documentElement.dataset['uiDensity']).toBe('comfortable');
  });
  it('keeps at least one column visible and supports keyboard sorting', async () => {
    const fixture = TestBed.createComponent(DataTableComponent); const table = fixture.componentInstance;
    fixture.componentRef.setInput('columns', [{ key: 'name', header: 'Name', sortable: true }, { key: 'amount', header: 'Amount' }]); fixture.detectChanges();
    table.toggleColumn('amount'); table.toggleColumn('name'); fixture.detectChanges();
    expect(table.visibleColumns.map(col => col.key)).toEqual(['name']);
    const sort = vi.spyOn(table.sortChange, 'emit'); fixture.nativeElement.querySelector('th').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(sort).toHaveBeenCalledWith({ column: 'name', direction: 'asc' });
  });
  it('exports visible loaded rows safely for spreadsheet applications', async () => {
    const fixture = TestBed.createComponent(DataTableComponent); const table = fixture.componentInstance;
    table.columns = [{ key: 'name', header: 'Name' }, { key: 'hidden', header: 'Hidden' }]; table.data = [{ name: '=2+2', hidden: 'private' }]; table.toggleColumn('hidden');
    let blob!: Blob; vi.spyOn(URL, 'createObjectURL').mockImplementation(value => { blob = value as Blob; return 'blob:preview'; }); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {}); vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    table.exportCsv(); expect(await blob.text()).toContain("Name\r\n'=2+2"); expect(await blob.text()).not.toContain('private');
  });
  it('does not activate a row when an inner button receives Enter', () => {
    const fixture = TestBed.createComponent(DataTableComponent); const table = fixture.componentInstance; table.clickable = true;
    const emit = vi.spyOn(table.rowClick, 'emit'); table.activateRow({ target: {}, currentTarget: {} } as Event, {}, 0); expect(emit).not.toHaveBeenCalled();
  });
  it('renders zero and programmatic disabled state in form controls', () => {
    const fixture = TestBed.createComponent(FormInputComponent); fixture.detectChanges();
    fixture.componentInstance.writeValue(0 as unknown as string); fixture.componentInstance.setDisabledState(true); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input').value).toBe('0'); expect(fixture.nativeElement.querySelector('input').disabled).toBe(true);
  });
  it('refreshes programmatically written select values', async () => {
    const fixture = TestBed.createComponent(FormSelectComponent); fixture.componentRef.setInput('options', [{ label: 'One', value: 1 }]); fixture.detectChanges();
    fixture.componentInstance.writeValue(1); fixture.componentInstance.setDisabledState(true); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('select').disabled).toBe(true); expect(fixture.nativeElement.querySelector('select').selectedOptions[0].textContent.trim()).toBe('One');
  });
  it('removes navigation and keyboard access from disabled link buttons', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ActionButtonComponent); fixture.componentRef.setInput('routerLink', '/client/payroll'); fixture.componentRef.setInput('disabled', true); fixture.detectChanges();
    const anchor = fixture.nativeElement.querySelector('a'); expect(anchor.getAttribute('href')).toBeNull(); expect(anchor.tabIndex).toBe(-1); expect(anchor.getAttribute('aria-disabled')).toBe('true');
  });
  it('focuses the shared dialog and restores focus on closing', async () => {
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    try {
      const fixture = TestBed.createComponent(ModalComponent); fixture.componentRef.setInput('title', 'Review'); fixture.detectChanges(); await fixture.whenStable();
      const dialog = fixture.nativeElement.querySelector('[role="dialog"]'); expect(dialog.contains(document.activeElement)).toBe(true);
      const closed = vi.spyOn(fixture.componentInstance.closed, 'emit'); document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); expect(closed).toHaveBeenCalledOnce();
      fixture.componentRef.setInput('isOpen', false); fixture.detectChanges(); expect(document.activeElement).toBe(opener);
    } finally { opener.remove(); }
  });
});
