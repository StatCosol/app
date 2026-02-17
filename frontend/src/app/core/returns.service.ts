import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ReturnsService {
  private readonly baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  listFilings(filters: any): Observable<any> {
    let params = new HttpParams();
    Object.entries(filters || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params = params.set(k, String(v));
      }
    });
    return this.http.get(`${this.baseUrl}/api/client/returns/filings`, { params });
  }

  listTypes(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/client/returns/types`);
  }

  createFiling(payload: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/client/returns/filings`, payload);
  }

  uploadAck(id: string, file: File, ackNumber?: string): Observable<any> {
    const form = new FormData();
    form.append('file', file);
    if (ackNumber) form.append('ackNumber', ackNumber);
    return this.http.post(`${this.baseUrl}/api/client/returns/filings/${id}/ack`, form);
  }

  uploadChallan(id: string, file: File): Observable<any> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post(`${this.baseUrl}/api/client/returns/filings/${id}/challan`, form);
  }

  submitFiling(id: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/client/returns/filings/${id}/submit`, {});
  }
}
