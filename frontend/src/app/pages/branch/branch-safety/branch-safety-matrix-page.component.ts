import { Component } from '@angular/core';
import { BranchSafetyComponent } from './branch-safety.component';

@Component({
  standalone: true,
  selector: 'app-branch-safety-matrix-page',
  imports: [BranchSafetyComponent],
  template: `<app-branch-safety></app-branch-safety>`,
})
export class BranchSafetyMatrixPageComponent {}
