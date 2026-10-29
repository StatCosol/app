import { Component, ViewChild } from '@angular/core';
import { AuditorReportBuilderComponent } from './auditor-report-builder.component';

@Component({
  standalone: true,
  selector: 'app-auditor-report-builder-page',
  imports: [AuditorReportBuilderComponent],
  template: `<app-auditor-report-builder></app-auditor-report-builder>`,
})
export class AuditorReportBuilderPageComponent {
  @ViewChild(AuditorReportBuilderComponent) builder?: AuditorReportBuilderComponent;
  canLeave(): boolean { return this.builder?.canLeave() ?? true; }
}
