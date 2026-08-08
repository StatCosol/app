import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ChecklistsApiService {
  private readonly base = `${environment.apiBaseUrl}/api/v1/checklists`;

  constructor(private http: HttpClient) {}

  getByBranch(branchId: string, status?: string): Observable<any[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<any[]>(`${this.base}/branch/${branchId}`, { params });
  }

  getBranchSummary(branchId: string): Observable<Record<string, number>> {
    return this.http.get<Record<string, number>>(`${this.base}/branch/${branchId}/summary`);
  }

  getByClient(clientId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/client/${clientId}`);
  }

  updateItem(id: string, body: Record<string, unknown>): Observable<any> {
    return this.http.patch(`${this.base}/${id}`, body);
  }
}
