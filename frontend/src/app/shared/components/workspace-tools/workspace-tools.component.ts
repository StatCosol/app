import { Component, ElementRef, HostListener, ViewChild, inject, signal, computed } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';

interface ModuleLink { label: string; url: string }
@Component({
  selector: 'app-workspace-tools',
  host: { class: 'bs-surface' },
  standalone: true,
  template: `
    <div class="workspace-tools" aria-label="Workspace tools">
      <div class="workspace-tools__identity">
        <span class="workspace-tools__mark" aria-hidden="true">S<span>↗</span></span>
        <div><span class="workspace-tools__label">STATCO · WORKSPACE</span><strong>{{ workspaceName }}</strong></div>
      </div>
      <div class="workspace-tools__actions">
        <button class="btn btn-primary workspace-tool-button" #trigger type="button" (click)="open()" aria-haspopup="dialog"><span aria-hidden="true">⌕</span> Find a module <kbd>Ctrl / ⌘ K</kbd></button>
        <button class="btn btn-outline-secondary workspace-tool-button" type="button" (click)="toggleDensity()" [attr.aria-pressed]="compact()" title="Switch table spacing">{{ compact() ? 'Compact view' : 'Comfortable view' }}</button>
      </div>
    </div>
    <dialog #finder class="module-finder" aria-labelledby="module-finder-title" (close)="restoreFocus()" (click)="backdrop($event)">
      <div class="module-finder__heading"><h2 id="module-finder-title">Find a module</h2><button class="workspace-tool-button" type="button" (click)="close()" aria-label="Close module finder">✕</button></div>
      <p>Search the modules available in your navigation.</p>
      <label class="sr-only" for="module-finder-search">Module name</label>
      <input class="form-control" #search id="module-finder-search" type="search" placeholder="Search modules…" autocomplete="off" [value]="query()" (input)="query.set(search.value)" (keydown.enter)="openFirst()" />
      <p class="module-finder__count" aria-live="polite">{{ filtered().length }} modules</p>
      <nav aria-label="Matching modules" class="module-finder__results">
        @for (link of filtered(); track link.url) {
          <button class="workspace-tool-button" type="button" (click)="navigate(link)"><span>{{ link.label }}</span><span aria-hidden="true">→</span></button>
        } @empty { <p>No matching modules. Try a different name.</p> }
      </nav>
      @if (error()) { <p role="alert">{{ error() }}</p> }
      <footer>Tab to browse · Enter to open · Esc to close</footer>
    </dialog>
  `,
  styleUrl: './workspace-tools.component.scss',
})
export class WorkspaceToolsComponent {
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  @ViewChild('finder', { static: true }) finder!: ElementRef<HTMLDialogElement>;
  @ViewChild('search', { static: true }) search!: ElementRef<HTMLInputElement>;
  private previousFocus: HTMLElement | null = null;
  readonly compact = signal(false);
  readonly query = signal('');
  readonly links = signal<ModuleLink[]>([]);
  readonly error = signal('');
  readonly filtered = computed(() => this.links().filter(link => link.label.toLocaleLowerCase().includes(this.query().trim().toLocaleLowerCase())));
  get workspaceName(): string {
    const portal = this.router.url.split('/').filter(Boolean)[0];
    const names: Record<string, string> = { admin: 'Administration', accounts: 'Accounts & billing', sales: 'Sales', auditor: 'Audit & assurance', contractor: 'Contractor operations', 'pf-team': 'PF & ESI operations', client: 'Client operations', ess: 'Employee self service', ceo: 'Executive overview', cco: 'Compliance oversight', branch: 'Branch operations', payroll: 'Payroll operations', crm: 'Client relationships' };
    return names[portal] || 'Your workspace';
  }

  constructor() {
    try { this.compact.set(this.doc.defaultView?.localStorage.getItem('statco.ui.density') === 'compact'); } catch { /* Storage can be disabled. */ }
    this.applyDensity();
  }
  toggleDensity(): void {
    this.compact.update(value => !value);
    this.applyDensity();
    try { this.doc.defaultView?.localStorage.setItem('statco.ui.density', this.compact() ? 'compact' : 'comfortable'); } catch { /* Preference remains available for this session. */ }
  }
  private applyDensity(): void { this.doc.documentElement.dataset['uiDensity'] = this.compact() ? 'compact' : 'comfortable'; }
  @HostListener('document:keydown', ['$event']) shortcut(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k' || event.altKey) return;
    if (this.doc.querySelector('dialog[open], [role="dialog"], [role="alertdialog"]')) return;
    event.preventDefault(); this.open();
  }
  open(): void {
    if (this.finder.nativeElement.open) return;
    const shell = this.host.nativeElement.closest('.workspace-ui');
    const base = new URL(this.doc.baseURI);
    const prefix = '/' + this.router.url.split('/').filter(Boolean)[0] + '/';
    const unique = new Map<string, ModuleLink>();
    shell?.querySelectorAll<HTMLAnchorElement>('aside a[href], nav a[href]').forEach(anchor => {
      const url = new URL(anchor.href, base);
      if (url.origin !== base.origin) return;
      const route = base.pathname !== '/' && url.pathname.startsWith(base.pathname)
        ? '/' + url.pathname.slice(base.pathname.length) : url.pathname;
      if (!route.startsWith(prefix)) return;
      const label = (anchor.getAttribute('aria-label') || anchor.getAttribute('data-tip') || anchor.getAttribute('title') || anchor.textContent || '').replace(/\s+/g, ' ').trim();
      if (label) unique.set(route + url.search, { label, url: route + url.search });
    });
    this.links.set([...unique.values()]); this.query.set(''); this.error.set('');
    this.previousFocus = this.doc.activeElement instanceof HTMLElement ? this.doc.activeElement : null;
    this.finder.nativeElement.showModal(); this.search.nativeElement.focus();
  }
  close(): void { this.finder.nativeElement.close(); }
  restoreFocus(): void { if (this.previousFocus?.isConnected) this.previousFocus.focus(); }
  backdrop(event: MouseEvent): void {
    if (event.target !== this.finder.nativeElement) return;
    const box = this.finder.nativeElement.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) this.close();
  }
  openFirst(): void { const first = this.filtered()[0]; if (first) void this.navigate(first); }
  async navigate(link: ModuleLink): Promise<void> {
    try { if (await this.router.navigateByUrl(link.url)) this.close(); else this.error.set('This module is unavailable. Please choose another module.'); }
    catch { this.error.set('Unable to open this module. Please try again.'); }
  }
}
