import { Injectable } from '@angular/core';
import { ComplianceApiService } from '../../../shared/services/compliance-api.service';

/**
 * Thin facade for BranchDesk compliance-docs endpoints.
 * Delegates to ComplianceApiService which holds the real route-aligned HTTP calls.
 */
@Injectable({ providedIn: 'root' })
export class BranchComplianceFacade {
  constructor(private api: ComplianceApiService) {}

  private periodQuery(monthKey: string) {
    const [year, month] = monthKey.split('-').map(Number);
    return Number.isFinite(year) && Number.isFinite(month) ? { year, month } : { monthKey };
  }

  checklist(monthKey?: string) {
    return this.api.branchGetChecklist(monthKey ? this.periodQuery(monthKey) : undefined);
  }

  kpis(monthKey?: string) {
    return this.api.branchDashboardKpis(monthKey ? this.periodQuery(monthKey) : undefined);
  }

  upload(file: File, meta: Record<string, any>) {
    return this.api.branchUploadComplianceDoc(file, meta);
  }

  list(query?: any) {
    return this.api.branchListDocs(query);
  }

  returnMaster() {
    return this.api.branchReturnMaster();
  }
}
