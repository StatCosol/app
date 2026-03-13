import { Component } from '@angular/core';
import { AuditorReportBuilderComponent } from './auditor-report-builder.component';

@Component({
  standalone: true,
  selector: 'app-auditor-report-builder-page',
  imports: [AuditorReportBuilderComponent],
  template: `<app-auditor-report-builder></app-auditor-report-builder>`,
})
export class AuditorReportBuilderPageComponent {}
