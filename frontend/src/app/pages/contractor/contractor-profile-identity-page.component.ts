import { Component } from '@angular/core';
import { ContractorProfileComponent } from './contractor-profile.component';

@Component({
  standalone: true,
  selector: 'app-contractor-profile-identity-page',
  imports: [ContractorProfileComponent],
  template: `<app-contractor-profile></app-contractor-profile>`,
})
export class ContractorProfileIdentityPageComponent {}
