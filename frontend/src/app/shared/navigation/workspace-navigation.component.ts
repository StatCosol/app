import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { workspaceNavigation } from './workspace-navigation';
@Component({
 selector: 'app-workspace-navigation', standalone: true, imports: [RouterLink],
 template: `@if (group; as workspace) {
  <section class="workspace-navigation" [attr.aria-label]="workspace.title">
   <h2>{{ workspace.title }}</h2>
   <nav [attr.aria-label]="workspace.title + ' views'">
    @for (link of workspace.links; track link.route) {
     <a [routerLink]="link.route" queryParamsHandling="preserve" [attr.aria-current]="isActive(link.route) ? 'page' : null">
      <strong>{{ link.label }}</strong><span>{{ link.description }}</span>
     </a>
    }
   </nav>
  </section>
 }`,
 styles: [`:host{display:block;min-width:0}.workspace-navigation{margin-bottom:1rem;padding:1rem;border:1px solid #dce8de;border-radius:.75rem;background:white}h2{font-size:.95rem;font-weight:650;margin:0 0 .75rem;color:#244c40}nav{display:flex;flex-wrap:wrap;gap:.5rem}a{flex:1 1 180px;min-width:0;border:1px solid #dce8de;border-radius:.5rem;padding:.75rem;color:#334155;text-decoration:none;overflow-wrap:anywhere}a:hover{background:#f3f8f2}a[aria-current=page]{border-color:#176954;background:#edf7f2;box-shadow:inset 0 3px #176954}a:focus-visible{outline:3px solid #2563eb;outline-offset:2px}strong,span{display:block}strong{font-size:.875rem}span{font-size:.75rem;line-height:1.5;margin-top:.3rem}@media(max-width:480px){a{flex-basis:100%}}`],
})
export class WorkspaceNavigationComponent {
 private readonly router = inject(Router);
 private readonly auth = inject(AuthService);
 get group() {
  const group = workspaceNavigation(this.router.url);
  if (!group) return undefined;
  const links = group.links.filter(l => !l.module || this.auth.hasModule(l.module));
  return links.length > 1 ? {...group, links} : undefined;
 }
 isActive(route: string): boolean { return this.router.url.split(/[?#]/)[0].replace(/^\/app(?=\/)/, '').replace(/(\/crm\/clients\/[^/]+)\/documents$/, '$1/compliance-tracker') === route; }
}
