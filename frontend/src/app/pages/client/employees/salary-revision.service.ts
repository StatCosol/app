import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface SalaryRevision {
  id: string;
  clientId: string;
  employeeId: string;
  effectiveDate: string;
  previousCtc: string;
  newCtc: string;
  incrementPct: string | null;
  reason: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class SalaryRevisionService {
  private base = `${environment.apiBaseUrl}/api/v1/employees/salary-revisions`;

  constructor(private http: HttpClient) {}

  create(dto: {
    clientId: string;
    employeeId: string;
    effectiveDate: string;
    previousCtc: number;
    newCtc: number;
    reason?: string;
  }): Observable<SalaryRevision> {
    return this.http.post<SalaryRevision>(this.base, dto);
  }

  listForEmployee(employeeId: string): Observable<SalaryRevision[]> {
    return this.http.get<SalaryRevision[]>(`${this.base}/employee/${employeeId}`);
  }

  getById(id: string): Observable<SalaryRevision> {
    return this.http.get<SalaryRevision>(`${this.base}/${id}`);
  }
}
