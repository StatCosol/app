import { Component } from '@angular/core';
import { ClientRegistersComponent } from './client-registers.component';

@Component({
  standalone: true,
  selector: 'app-client-registers-download-page',
  imports: [ClientRegistersComponent],
  template: `<app-client-registers></app-client-registers>`,
})
export class ClientRegistersDownloadPageComponent {}
