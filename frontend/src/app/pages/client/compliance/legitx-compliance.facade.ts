import { Injectable } from '@angular/core';
import { ComplianceApiService } from '../../../shared/services/compliance-api.service';

/**
 * Thin facade for LegitX (Master Client) compliance endpoints.
 * Delegates to ComplianceApiService which holds the real route-aligned HTTP calls.
 */
@Injectable({ providedIn: 'root' })
export class LegitxComplianceFacade {
  constructor(private api: ComplianceApiService) {}

  // ── Compliance Status controller ──
  summary(monthKey?: string) {
    return this.api.legitxSummary(monthKey ? { monthKey } : undefined);
  }

  branches(monthKey?: string) {
    return this.api.legitxBranches(monthKey ? { monthKey } : undefined);
  }

  tasks(query?: { branchId?: string; monthKey?: string; status?: string }) {
    return this.api.legitxTasks(query);
  }

  // ── MCD ──
  mcd(query?: { branchId?: string; monthKey?: string }) {
    return this.api.legitxGetMcd(query);
  }
}
