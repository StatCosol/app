import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AdminNotificationService {
  // Use relative API path (proxy-friendly; works in prod behind reverse proxy)
  private base = '/api/admin/notifications';

  constructor(private http: HttpClient) {}

  list(filters: any): Observable<any> {
    let params = new HttpParams();
    Object.keys(filters || {}).forEach(k => {
      if (filters[k] !== undefined && filters[k] !== null && filters[k] !== '') {
        params = params.set(k, String(filters[k]));
      }
    });
    return this.http.get(this.base, { params });
  }

  detail(id: string): Observable<any> {
    return this.http.get(`${this.base}/${id}`);
  }

  reply(id: string, payload: { message: string; attachmentPath?: string }): Observable<any> {
    return this.http.post(`${this.base}/${id}/reply`, payload);
  }

  markRead(id: string): Observable<any> {
    return this.http.post(`${this.base}/${id}/read`, {});
  }

  setStatus(id: string, status: string): Observable<any> {
    return this.http.patch(`${this.base}/${id}/status`, { status });
  }
}
