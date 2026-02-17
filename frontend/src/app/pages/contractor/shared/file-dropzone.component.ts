import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-file-dropzone',
  imports: [CommonModule],
  template: `
  <div class="dz" [class.drag]="dragging"
       (dragover)="onDragOver($event)" (dragleave)="onDragLeave($event)" (drop)="onDrop($event)">
    <div class="dz-inner">
      <div class="title">{{title}}</div>
      <div class="sub">Drag & drop files here or</div>
      <label class="btn">
        Browse
        <input type="file" multiple (change)="onPick($event)" hidden />
      </label>
      <div class="hint">Allowed: PDF / Excel / JPG / PNG (max {{maxMb}}MB)</div>
    </div>
  </div>

  <div class="files" *ngIf="files.length">
    <div class="file" *ngFor="let f of files; let i=index">
      <div class="name">{{f.name}}</div>
      <div class="meta">{{(f.size/1024/1024) | number:'1.1-1'}} MB</div>
      <button class="link" type="button" (click)="remove(i)">Remove</button>
    </div>
  </div>
  `,
  styles: [`
    .dz{border:2px dashed #cbd5e1;border-radius:14px;padding:14px;background:#fff}
    .dz.drag{border-color:#2563eb;background:#eff6ff}
    .dz-inner{display:flex;flex-direction:column;gap:8px;align-items:flex-start}
    .title{font-weight:700}
    .sub{color:#6b7280;font-size:13px}
    .btn{display:inline-flex;align-items:center;gap:8px;background:#2563eb;color:#fff;padding:8px 12px;border-radius:10px;cursor:pointer}
    .hint{font-size:12px;color:#6b7280}
    .files{margin-top:12px;display:flex;flex-direction:column;gap:8px}
    .file{display:flex;align-items:center;gap:10px;border:1px solid #e5e7eb;border-radius:12px;padding:10px;background:#f9fafb}
    .name{flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .meta{color:#6b7280;font-size:12px}
    .link{background:transparent;border:0;color:#dc2626;font-weight:600;cursor:pointer}
  `]
})
export class FileDropzoneComponent {
  @Input() title = 'Upload Evidence';
  @Input() maxMb = 10;
  @Input() files: File[] = [];
  @Output() filesChange = new EventEmitter<File[]>();

  dragging = false;

  onDragOver(e: DragEvent){ e.preventDefault(); this.dragging = true; }
  onDragLeave(e: DragEvent){ e.preventDefault(); this.dragging = false; }

  onDrop(e: DragEvent){
    e.preventDefault();
    this.dragging = false;
    const dropped = Array.from(e.dataTransfer?.files || []);
    this.addFiles(dropped);
  }

  onPick(e: any){
    const picked = Array.from(e.target.files || []) as File[];
    this.addFiles(picked);
    e.target.value = '';
  }

  addFiles(list: File[]){
    const next = [...(this.files || [])];
    for (const f of list) {
      // simple client-side size check
      if (f.size > this.maxMb * 1024 * 1024) continue;
      next.push(f);
    }
    this.files = next;
    this.filesChange.emit(next);
  }

  remove(i: number){
    const next = [...this.files];
    next.splice(i, 1);
    this.files = next;
    this.filesChange.emit(next);
  }
}
