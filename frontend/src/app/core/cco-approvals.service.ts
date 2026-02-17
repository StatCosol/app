import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CcoApprovalsService {
  private baseUrl = environment.apiBaseUrl + '/api/cco/approvals';

  constructor(private http: HttpClient) {}

  list(): Observable<any[]> {
    return this.http.get<any[]>(this.baseUrl);
  }

  approve(id: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/approve`, {});
  }

  reject(id: number, remarks: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/reject`, { remarks });
  }
}
