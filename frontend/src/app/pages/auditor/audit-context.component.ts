import { Component, Input } from '@angular/core';
import { auditContext } from './audit-context';

@Component({
  selector: 'app-audit-context', standalone: true,
  template: `@if (audit) {
    <section class="audit-context" aria-label="Current audit scope">
      <div class="audit-context__heading"><span>Current audit</span><strong>{{ context.client }}</strong></div>
      <dl>
        <div><dt>Audit type</dt><dd>{{ context.type }}</dd></div>
        <div><dt>Branch / unit</dt><dd>{{ context.branch }}</dd></div>
        <div><dt>Audit period</dt><dd>{{ context.period }}</dd></div>
        <div><dt>Contractor</dt><dd>{{ context.contractor }}</dd></div>
        <div><dt>Audit reference</dt><dd>{{ context.code }}</dd></div>
        <div><dt>Audit stage</dt><dd>{{ context.status }}</dd></div>
      </dl>
      @if (context.warning) { <p class="scope-warning" role="status">{{ context.warning }}</p> }
    </section>
  }`,
  styles: [`:host { display:block; margin:0; } .audit-context { border:1px solid #bdd6d0; border-left:5px solid #165342; border-radius:12px; background:#f4faf7; padding:12px 16px; color:#193a31; }
    .audit-context__heading { display:flex; flex-direction:column; gap:4px; margin-bottom:10px; } .audit-context__heading span,dt { font-size:12px; color:#526c64; } .audit-context__heading strong { font-size:20px; }
    dl { margin:0; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px 20px; } dd { margin:4px 0 0; font-size:14px; font-weight:600; overflow-wrap:anywhere; } .scope-warning { margin:10px 0 0; padding:8px 10px; border-radius:8px; color:#784800; background:#fff4d7; font-size:14px; }
    @media(max-width:720px) { dl { grid-template-columns:repeat(2,minmax(0,1fr)); } } @media(max-width:420px) { dl { grid-template-columns:1fr; } }`],
})
export class AuditContextComponent {
  @Input() audit: any;
  get context() { return auditContext(this.audit); }
}
