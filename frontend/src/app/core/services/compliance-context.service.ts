import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ComplianceContextState {
  clientId: string | null;
  clientCode: string | null;
  branchId: string | null;
  branchCode: string | null;
  role: 'CRM' | 'CLIENT' | 'BRANCH' | 'AUDITOR' | 'ADMIN' | null;
}

@Injectable({
  providedIn: 'root',
})
export class ComplianceContextService {
  private readonly stateSubject = new BehaviorSubject<ComplianceContextState>({
    clientId: null,
    clientCode: null,
    branchId: null,
    branchCode: null,
    role: null,
  });

  readonly state$ = this.stateSubject.asObservable();

  get snapshot(): ComplianceContextState {
    return this.stateSubject.value;
  }

  setContext(partial: Partial<ComplianceContextState>): void {
    this.stateSubject.next({
      ...this.stateSubject.value,
      ...partial,
    });
  }

  clearContext(): void {
    this.stateSubject.next({
      clientId: null,
      clientCode: null,
      branchId: null,
      branchCode: null,
      role: null,
    });
  }
}
