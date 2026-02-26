import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AuditLogEntry {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  performedBy: string | null;
  snapshot: Record<string, unknown> | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class AdminAuditLogsService {
  private readonly base = `${environment.apiBaseUrl}/api/v1/admin/audit-logs`;

  constructor(private http: HttpClient) {}

  list(filters?: {
    entityType?: string;
    action?: string;
    performedBy?: string;
    entityId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Observable<AuditLogEntry[]> {
    let params = new HttpParams();
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          params = params.set(k, String(v));
        }
      });
    }
    return this.http.get<AuditLogEntry[]>(this.base, { params });
  }
}
