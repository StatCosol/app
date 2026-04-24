import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ComplianceNotification {
  id: string;
  clientId: string | null;
  branchId: string | null;
  role: string;
  module: string;
  title: string;
  message: string;
  status: 'OPEN' | 'READ';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  entityId: string | null;
  entityType: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationBadge {
  unread: number;
}

@Injectable({ providedIn: 'root' })
export class ComplianceNotificationCenterService {
  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private http: HttpClient) {}

  getNotifications(role: string, clientId?: string, branchId?: string): Observable<ComplianceNotification[]> {
    let params = new HttpParams().set('role', role);
    if (clientId) params = params.set('clientId', clientId);
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<ComplianceNotification[]>(
      `${this.baseUrl}/api/v1/compliance-notifications`,
      { params },
    );
  }

  getBadge(role: string, clientId?: string, branchId?: string): Observable<NotificationBadge> {
    let params = new HttpParams().set('role', role);
    if (clientId) params = params.set('clientId', clientId);
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<NotificationBadge>(
      `${this.baseUrl}/api/v1/compliance-notifications/badge`,
      { params },
    );
  }

  markRead(id: string): Observable<any> {
    return this.http.patch(
      `${this.baseUrl}/api/v1/compliance-notifications/${id}/read`,
      {},
    );
  }
}
