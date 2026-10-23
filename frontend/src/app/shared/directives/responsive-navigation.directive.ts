import { AfterViewInit, Directive, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

/** Drawer behaviour only below the desktop breakpoint; desktop navigation stays in the tab order. */
@Directive({ selector: '[uiResponsiveNavigation]', standalone: true })
export class ResponsiveNavigationDirective implements AfterViewInit, OnChanges, OnDestroy {
  @Input() uiResponsiveNavigation = false;
  @Output() navigationDismiss = new EventEmitter<void>();
  private readonly panel = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly doc = inject(DOCUMENT);
  private readonly media = this.doc.defaultView!.matchMedia('(max-width: 1023.98px)');
  private opener: HTMLElement | null = null;
  private active = false;
  private ready = false;
  private destroyed = false;
  private readonly resize = () => this.sync();

  ngAfterViewInit(): void {
    this.ready = true;
    this.media.addEventListener('change', this.resize);
    this.sync();
  }
  ngOnChanges(): void { if (this.ready) this.sync(); }
  private controls(): HTMLElement[] {
    return [...this.panel.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]')]
      .filter(el => el.tabIndex >= 0 && !el.matches(':disabled,[inert]') && el.getClientRects().length > 0
        && getComputedStyle(el).visibility !== 'hidden');
  }
  private sync(): void {
    const next = this.media.matches && this.uiResponsiveNavigation;
    const wasActive = this.active;
    this.active = next;
    this.panel.inert = this.media.matches && !next;
    if (this.media.matches && !next) this.panel.setAttribute('aria-hidden', 'true');
    else this.panel.removeAttribute('aria-hidden');
    this.panel.setAttribute('role', next ? 'dialog' : 'navigation');
    this.panel.setAttribute('aria-label', 'Navigation');
    if (next) this.panel.setAttribute('aria-modal', 'true');
    else this.panel.removeAttribute('aria-modal');
    if (next && !wasActive) {
      this.opener = this.doc.activeElement instanceof HTMLElement ? this.doc.activeElement : null;
      this.panel.tabIndex = -1;
      this.doc.defaultView!.requestAnimationFrame(() => {
        if (!this.destroyed && this.active) (this.panel.querySelector<HTMLElement>('[aria-label="Close navigation"]') || this.controls()[0] || this.panel).focus();
      });
    } else if (!next && wasActive && this.media.matches && this.opener?.isConnected) {
      this.opener.focus();
    }
  }
  @HostListener('keydown', ['$event']) key(event: KeyboardEvent): void {
    if (!this.active) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); this.navigationDismiss.emit(); return;
    }
    if (event.key !== 'Tab') return;
    const controls = this.controls(), first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); this.panel.focus(); return; }
    if (event.shiftKey && (this.doc.activeElement === first || this.doc.activeElement === this.panel)) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && (this.doc.activeElement === last || this.doc.activeElement === this.panel)) {
      event.preventDefault(); first.focus();
    }
  }
  @HostListener('document:focusin', ['$event']) focus(event: FocusEvent): void {
    if (this.active && !this.panel.contains(event.target as Node)) (this.controls()[0] || this.panel).focus();
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.media.removeEventListener('change', this.resize);
  }
}
