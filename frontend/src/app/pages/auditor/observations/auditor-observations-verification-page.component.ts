import { Component } from '@angular/core';
import { AuditorObservationsComponent } from './auditor-observations.component';

@Component({
  standalone: true,
  selector: 'app-auditor-observations-verification-page',
  imports: [AuditorObservationsComponent],
  template: `<app-auditor-observations></app-auditor-observations>`,
})
export class AuditorObservationsVerificationPageComponent {}
