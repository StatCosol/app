import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { WorkspaceNavigationComponent } from './workspace-navigation.component';
import { portalPagePurpose } from './portal-page-purpose';

@Component({
  selector: 'app-portal-page-purpose',
  standalone: true,
  imports: [WorkspaceNavigationComponent],
  template: `@if (guide; as purpose) {
    <aside aria-label="Page purpose"><strong class="sr-only">{{ purpose.title }}: </strong><p>{{ purpose.purpose }}</p></aside>
  }<app-workspace-navigation></app-workspace-navigation>`,
  styles: [`:host { display: block; min-width: 0; }
    aside { padding: .5rem .75rem; margin-bottom: .75rem; border-left: 3px solid #b6cc9b; color: #3f5b50; overflow-wrap: anywhere; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    p { margin: 0; font-size: .875rem; line-height: 1.6; }
  `],
})
export class PortalPagePurposeComponent {
  private readonly router = inject(Router);
  get guide() { return portalPagePurpose(this.router.url); }
}
