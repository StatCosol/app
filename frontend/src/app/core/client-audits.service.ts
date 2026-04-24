import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ClientAuditsService {
  constructor(private http: HttpClient) {}
  private readonly baseUrl = environment.apiBaseUrl || '';

  getSummary(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/client/audits/summary`);
  }

  list(filters?: any): Observable<any> {
    let params = new HttpParams();
    if (filters) {
      Object.keys(filters).forEach(k => {
        if (filters[k] !== undefined && filters[k] !== null && filters[k] !== '') {
          params = params.set(k, String(filters[k]));
        }
      });
    }
    return this.http.get(`${this.baseUrl}/api/v1/client/audits`, { params });
  }
}
