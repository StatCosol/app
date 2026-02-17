import { Directive, Input, TemplateRef, ViewContainerRef } from '@angular/core';
import { AuthService } from '../../core/auth.service';

@Directive({
  selector: '[appHasRole]',
  standalone: true,
})
export class HasRoleDirective {
  private roles: string[] = [];
  private hasView = false;

  constructor(
    private readonly tpl: TemplateRef<any>,
    private readonly vcr: ViewContainerRef,
    private readonly auth: AuthService,
  ) {}

  @Input()
  set appHasRole(value: string[] | string) {
    if (!value) {
      this.roles = [];
    } else if (Array.isArray(value)) {
      this.roles = value.map((r) => (r || '').toString().toUpperCase());
    } else {
      this.roles = [value.toString().toUpperCase()];
    }
    this.updateView();
  }

  private updateView() {
    const userRole = (this.auth.getRoleCode() || '').toUpperCase();
    const allowed = this.roles.length === 0 ? true : this.roles.includes(userRole);

    if (allowed && !this.hasView) {
      this.vcr.createEmbeddedView(this.tpl);
      this.hasView = true;
    } else if (!allowed && this.hasView) {
      this.vcr.clear();
      this.hasView = false;
    }
  }
}
