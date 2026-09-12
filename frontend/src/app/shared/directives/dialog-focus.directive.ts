import { AfterViewInit, Directive, ElementRef, EventEmitter, HostListener, OnDestroy, Output, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

/** Keeps keyboard focus in the foremost shared dialog and restores its opener. */
@Directive({ selector: '[uiDialogFocus]', standalone: true })
export class DialogFocusDirective implements AfterViewInit, OnDestroy {
  private static stack: DialogFocusDirective[] = [];
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly doc = inject(DOCUMENT);
  private opener: HTMLElement | null = null;
  private destroyed = false;
  @Output() uiDialogEscape = new EventEmitter<void>();
  private get topmost(): boolean { return DialogFocusDirective.stack.at(-1) === this; }
  private controls(): HTMLElement[] {
    return [...this.element.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')]
      .filter(node => node.tabIndex >= 0 && !node.matches(':disabled, [hidden], [aria-hidden="true"]') && node.getClientRects().length > 0);
  }
  ngAfterViewInit(): void {
    this.opener = this.doc.activeElement instanceof HTMLElement ? this.doc.activeElement : null;
    this.element.tabIndex = -1;
    DialogFocusDirective.stack.push(this);
    queueMicrotask(() => { if (!this.destroyed && this.topmost) (this.controls()[0] || this.element).focus(); });
  }
  @HostListener('keydown', ['$event']) onKey(event: KeyboardEvent): void {
    if (!this.topmost) return;
    if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); this.uiDialogEscape.emit(); return; }
    if (event.key !== 'Tab') return;
    const controls = this.controls();
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); this.element.focus(); return; }
    if (event.shiftKey && (this.doc.activeElement === first || this.doc.activeElement === this.element)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (this.doc.activeElement === last || this.doc.activeElement === this.element)) { event.preventDefault(); first.focus(); }
  }
  @HostListener('document:focusin', ['$event']) onFocus(event: FocusEvent): void {
    if (this.topmost && !this.doc.querySelector('dialog[open]') && !this.element.contains(event.target as Node)) (this.controls()[0] || this.element).focus();
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    const wasTop = this.topmost;
    DialogFocusDirective.stack = DialogFocusDirective.stack.filter(dialog => dialog !== this);
    if (wasTop && this.opener?.isConnected) this.opener.focus();
  }
}
