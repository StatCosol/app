import { Component } from '@angular/core';
import { BranchRegistrationsComponent } from './branch-registrations.component';

@Component({
  standalone: true,
  selector: 'app-branch-registrations-page',
  imports: [BranchRegistrationsComponent],
  template: `<app-branch-registrations></app-branch-registrations>`,
})
export class BranchRegistrationsPageComponent {}
