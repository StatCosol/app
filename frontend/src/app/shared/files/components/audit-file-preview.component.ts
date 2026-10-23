import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnInit, OnDestroy, AfterViewInit, inject, ChangeDetectorRef } from '@angular/core';
import { DialogFocusDirective } from '../../directives/dialog-focus.directive';
import { DOCUMENT } from '@angular/common';
import { CommonModule } from '@angular/common';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { ProtectedFileService, ProtectedFileHandle } from '../services/protected-file.service';
import { downloadBlob } from '../../utils/download-blob';

export interface AuditFilePreview {
  url?: string;
  blob?: Blob;
  name: string;
}

/** Keeps authenticated evidence in the audit page; no popup or public file URL. */
@Component({
  selector: 'app-audit-file-preview',
  standalone: true,
  imports: [CommonModule, DialogFocusDirective],
  template: `
    <div class="backdrop" (click)="closed.emit()">
      <section uiDialogFocus (uiDialogEscape)="closed.emit()" role="dialog" aria-modal="true" aria-label="Document preview" (click)="$event.stopPropagation()">
        <header><div><h2>Document preview</h2><p>{{ request.name }}</p></div>
          <button class="preview-action" type="button" (click)="closed.emit()" aria-label="Close preview">Close</button></header>
        <div class="toolbar">
          @if (pages > 0) {
            <div class="page-controls">
            <button class="preview-action" type="button" (click)="showPage(page - 1)" [disabled]="rendering || page <= 1">Previous page</button>
            <span aria-live="polite">Page {{ page }} of {{ pages }}</span>
            <button class="preview-action" type="button" (click)="showPage(page + 1)" [disabled]="rendering || page >= pages">Next page</button>
            </div>
          }
          @if (sheetNames.length) {
            <label>Worksheet <select aria-label="Worksheet" (change)="showSheet($any($event.target).value)">
              @for (name of sheetNames; track name) { <option [value]="name">{{ name }}</option> }
            </select></label>
          }
          @if (pages > 0 || imageUrl) {
            <label>Zoom <select aria-label="Preview zoom" [value]="zoom" (change)="zoom = +$any($event.target).value">
              <option value="100">Fit width</option><option value="150">150%</option><option value="200">200%</option>
            </select></label>
          }
          <button class="preview-action" type="button" [disabled]="!blob" (click)="download()">Download original</button>
        </div>
        <div class="body">
          @if (loading) { <p role="status">Loading document…</p> }
          @if (error) { <p role="alert">{{ error }}</p> }
          <canvas [style.width.%]="zoom" #canvas [hidden]="!pages || !!error" [attr.aria-label]="'Document page ' + page"></canvas>
          @if (imageUrl) { <img [style.width.%]="zoom" [src]="imageUrl" alt="Document preview" /> }
          @if (sheetNames.length) {
            <p>{{ sheetName }} — preview of up to 200 rows and 50 columns. Download the original for the full workbook.</p>
            <table aria-label="Worksheet preview"><tbody>
              @for (row of rows; track $index) { <tr>@for (cell of row; track $index) { <td>{{ cell }}</td> }</tr> }
            </tbody></table>
          }
          @if (unsupported) { <p>This file type cannot be previewed here. Use Download original to open it in a compatible application.</p> }
        </div>
      </section>
    </div>`,
  styles: [`
    :host{position:fixed;inset:0;z-index:2000}.backdrop{height:100%;background:#0f172aaa;display:flex;align-items:center;justify-content:center;padding:16px}
    section{background:white;border-radius:12px;width:min(1100px,100%);height:92dvh;display:flex;flex-direction:column;overflow:hidden;color:#16352d}
    header,.toolbar{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid #ddd;flex-wrap:wrap}
    .toolbar{align-items:flex-end}.toolbar>label{display:flex;flex-direction:column;align-items:stretch;gap:4px;min-width:0;max-width:100%;margin:0;font-size:14px}.toolbar>label:has([aria-label="Preview zoom"]){width:140px}.toolbar select{width:100%;height:44px;box-sizing:border-box}.toolbar>.preview-action{height:44px;box-sizing:border-box;white-space:nowrap}.page-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:100%;min-width:0}.page-controls .preview-action{height:44px;padding:7px 8px;font-size:14px;white-space:nowrap}.page-controls span{font-size:14px;white-space:nowrap}header,.toolbar{flex-shrink:0}header{justify-content:space-between}header div{min-width:0;flex:1}h2{font-size:20px;margin:0}p{overflow-wrap:anywhere;margin:6px 0}
    button,select{border:1px solid #b7c6bf;border-radius:6px;padding:7px 12px;background:white}button.preview-action{min-height:44px;background:#116653;color:white;border-color:#116653;font:inherit}button:disabled{opacity:.45}select{min-height:44px;font-size:16px}h2{color:inherit}header{max-height:24dvh;overflow:auto}
    .body{min-height:0;overflow:auto;background:#eef2f1;padding:16px;flex:1}canvas,img{max-width:none;height:auto;display:block;margin:auto;background:white}
    canvas[hidden]{display:none}table{border-collapse:collapse;background:white;font-size:13px}td{border:1px solid #ccc;padding:5px;white-space:pre-wrap;min-width:70px}
    [role=alert]{color:#a31b1b} @media(max-width:600px){.backdrop{padding:4px}section{height:98dvh}.body{padding:6px}}
  `],
})
export class AuditFilePreviewComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly doc = inject(DOCUMENT);
  @Input({ required: true }) request!: AuditFilePreview;
  @Output() closed = new EventEmitter<void>();
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  blob: Blob | null = null;
  loading = true;
  rendering = false;
  error = '';
  unsupported = false;
  zoom = 100;
  page = 1;
  pages = 0;
  imageUrl = '';
  sheetNames: string[] = [];
  sheetName = '';
  rows: string[][] = [];
  private stopped = false;
  private readonly destroy$ = new Subject<void>();
  private file?: ProtectedFileHandle;
  private pdfTask: any;
  private pdf: any;
  private renderTask: any;
  private workbook: any;
  private sheets: any;

  constructor(private files: ProtectedFileService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void { void this.load(); }

  ngAfterViewInit(): void {
    // Page animation/containment creates a containing block for fixed descendants.
    // Mount the overlay at body level so its bounds always use the viewport.
    this.doc.body.appendChild(this.host);
  }

  async load(): Promise<void> {
    try {
      if (this.request.blob) this.blob = this.request.blob;
      else {
        this.file = await firstValueFrom(this.files.fetch(this.request.url!, this.request.name).pipe(takeUntil(this.destroy$)));
        if (this.stopped) { this.file.revoke(); return; }
        this.blob = this.file.blob;
      }
      if (!this.blob.size) throw new Error('The file is empty.');
      if (this.blob.size > 50 * 1024 * 1024) {
        this.error = 'This file is too large for preview. Download the original to open it.';
        return;
      }
      const bytes = new Uint8Array(await this.blob.arrayBuffer());
      if (this.stopped) return;
      const signature = String.fromCharCode(...bytes.slice(0, 5));
      if (signature === '%PDF-') {
        const pdfjs = await import('pdfjs-dist');
        if (this.stopped) return;
        const assets = new URL('assets/pdfjs/', document.baseURI).href;
        pdfjs.GlobalWorkerOptions.workerSrc = assets + 'pdf.worker.mjs';
        this.pdfTask = pdfjs.getDocument({ data: bytes, cMapUrl: assets + 'cmaps/', cMapPacked: true, standardFontDataUrl: assets + 'standard_fonts/', wasmUrl: assets + 'wasm/' });
        this.pdf = await this.pdfTask.promise;
        if (this.stopped) return;
        this.pages = this.pdf.numPages;
        await this.showPage(1);
      } else if (/\.(xlsx?|csv)$/i.test(this.request.name)) {
        this.sheets = await import('xlsx');
        if (this.stopped) return;
        this.workbook = this.sheets.read(bytes, { type: 'array', sheetRows: 200, cellHTML: false, cellFormula: false });
        this.sheetNames = this.workbook.SheetNames;
        this.showSheet(this.sheetNames[0]);
      } else if (/^image\/(png|jpeg|gif|webp)$/.test(this.blob.type)) {
        // Data URLs work under the application's existing image policy.
        this.imageUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Image preview failed'));
          reader.readAsDataURL(this.blob!);
        });
      } else this.unsupported = true;
    } catch {
      if (!this.stopped) this.error = this.blob
        ? 'This document could not be previewed. Download the original to inspect it.'
        : 'The document could not be loaded. Check your access and try again.';
    } finally {
      if (!this.stopped) { this.loading = false; this.cdr.markForCheck(); }
    }
  }

  async showPage(page: number): Promise<void> {
    if (!this.pdf || this.rendering || page < 1 || page > this.pages) return;
    this.rendering = true;
    try {
      const pdfPage = await this.pdf.getPage(page);
      if (this.stopped) return;
      const viewport = pdfPage.getViewport({ scale: 1.4 });
      const canvas = this.canvas.nativeElement;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      this.renderTask = pdfPage.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport });
      await this.renderTask.promise;
      if (!this.stopped) this.page = page;
    } catch {
      if (!this.stopped) this.error = 'This page could not be rendered. Download the original to inspect it.';
    } finally {
      if (!this.stopped) { this.rendering = false; this.cdr.markForCheck(); }
    }
  }

  showSheet(name: string): void {
    if (!this.workbook?.Sheets[name]) return;
    this.sheetName = name;
    const sheet = this.workbook.Sheets[name];
    const range = this.sheets.utils.decode_range(sheet['!ref'] || 'A1');
    range.e.r = Math.min(range.e.r, range.s.r + 199);
    range.e.c = Math.min(range.e.c, range.s.c + 49);
    this.rows = this.sheets.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', range }).map((row: any[]) => row.map(value => String(value)));
    this.cdr.markForCheck();
  }

  async download(): Promise<void> {
    if (!this.blob) return;
    try { await downloadBlob(this.blob, this.request.name); }
    catch { this.error = 'Download failed. Please try again.'; this.cdr.markForCheck(); }
  }

  ngOnDestroy(): void {
    this.stopped = true;
    this.destroy$.next(); this.destroy$.complete();
    this.renderTask?.cancel();
    void this.pdfTask?.destroy();
    this.file?.revoke();
    this.imageUrl = '';
    this.host.remove();
  }
}
