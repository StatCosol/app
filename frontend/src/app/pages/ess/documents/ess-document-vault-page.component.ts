import { Component } from '@angular/core';
import { EssDocumentVaultComponent } from './ess-document-vault.component';

@Component({
  standalone: true,
  selector: 'app-ess-document-vault-page',
  imports: [EssDocumentVaultComponent],
  template: `<app-ess-document-vault></app-ess-document-vault>`,
})
export class EssDocumentVaultPageComponent {}
