import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CcoDashboardService {
  private baseUrl = environment.apiBaseUrl;
  private dashboardUrl = `${this.baseUrl}/api/v1/cco/dashboard`;

  constructor(private http: HttpClient) {}

  getDashboard(): Observable<any> {
    return this.http.get(this.dashboardUrl);
  }
}
