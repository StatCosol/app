import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CrmReturnsService {
  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private http: HttpClient) {}

  listFilings(params?: any): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/crm/returns/filings`, { params });
  }

  getReturnTypes(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/crm/returns/types`);
  }

  updateStatus(filingId: string, dto: any): Observable<any> {
    return this.http.patch(`${this.baseUrl}/api/v1/crm/returns/filings/${filingId}/status`, dto);
  }

  uploadAck(filingId: string, file: File, ackNumber?: string): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    if (ackNumber) fd.append('ackNumber', ackNumber);
    return this.http.post(`${this.baseUrl}/api/v1/crm/returns/filings/${filingId}/ack`, fd);
  }

  uploadChallan(filingId: string, file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post(`${this.baseUrl}/api/v1/crm/returns/filings/${filingId}/challan`, fd);
  }
}
