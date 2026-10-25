import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { portalPagePurpose } from './portal-page-purpose';

@Component({
  selector: 'app-portal-page-purpose',
  standalone: true,
  template: `@if (guide; as purpose) {
    <aside aria-label="Page purpose"><strong>{{ purpose.title }}</strong><p>{{ purpose.purpose }}</p></aside>
  }`,
  styles: [`:host { display: block; min-width: 0; }
    aside { padding: 1rem; margin-bottom: 1rem; border: 1px solid #dce8de; border-left: 4px solid #176954; border-radius: .5rem; background: #f3f8f2; color: #244c40; overflow-wrap: anywhere; }
    strong { display: block; font-size: .95rem; line-height: 1.5; }
    p { margin: .35rem 0 0; font-size: .875rem; line-height: 1.65; }
  `],
})
export class PortalPagePurposeComponent {
  private readonly router = inject(Router);
  get guide() { return portalPagePurpose(this.router.url); }
}
