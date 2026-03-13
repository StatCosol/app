import { Component } from '@angular/core';
import { BranchMcdComponent } from '../branch-mcd/branch-mcd.component';

@Component({
  standalone: true,
  selector: 'app-branch-monthly-compliance-page',
  imports: [BranchMcdComponent],
  template: `<app-branch-mcd></app-branch-mcd>`,
})
export class BranchMonthlyCompliancePageComponent {}
