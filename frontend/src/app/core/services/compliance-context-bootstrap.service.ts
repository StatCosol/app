import { Injectable } from '@angular/core';
import { AuthService } from '../auth.service';
import { ComplianceContextService } from './compliance-context.service';

@Injectable({ providedIn: 'root' })
export class ComplianceContextBootstrapService {
  private hydrated = false;

  constructor(
    private readonly auth: AuthService,
    private readonly ctx: ComplianceContextService,
  ) {}

  /** Call once after login or layout init to seed context from session profile */
  hydrate(): void {
    if (this.hydrated) return;
    const user = this.auth.getUser();
    if (!user) return;

    const role = (user.roleCode || null) as 'CRM' | 'CLIENT' | 'BRANCH' | 'AUDITOR' | 'ADMIN' | null;

    this.ctx.setContext({
      role,
      clientId: user.clientId ?? null,
      clientCode: user.clientCode ?? user.clientName ?? null,
      branchId: (user.branchIds?.length === 1 ? user.branchIds[0] : null) ?? null,
      branchCode: null,
    });

    this.hydrated = true;
  }

  reset(): void {
    this.hydrated = false;
    this.ctx.clearContext();
  }
}
