import { Injectable } from '@angular/core';
import { ComplianceApiService } from '../../../shared/services/compliance-api.service';

/**
 * Thin facade for BranchDesk compliance-docs endpoints.
 * Delegates to ComplianceApiService which holds the real route-aligned HTTP calls.
 */
@Injectable({ providedIn: 'root' })
export class BranchComplianceFacade {
  constructor(private api: ComplianceApiService) {}

  checklist(monthKey?: string) {
    return this.api.branchGetChecklist(monthKey ? { monthKey } : undefined);
  }

  kpis(monthKey?: string) {
    return this.api.branchDashboardKpis(monthKey ? { monthKey } : undefined);
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
