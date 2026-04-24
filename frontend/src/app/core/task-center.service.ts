import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface TaskSummary {
  open: number;
  overdue: number;
  dueSoon: number;
  total: number;
}

export interface SystemTask {
  id: string;
  module: string;
  title: string;
  description: string;
  reference_id: string;
  reference_type: string;
  priority: string;
  assigned_role: string;
  assigned_user_id: string | null;
  client_id: string | null;
  branch_id: string | null;
  contractor_id: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class TaskCenterService {
  private base = `${environment.apiBaseUrl}/api/v1/tasks`;

  constructor(private http: HttpClient) {}

  getMySummary(params: {
    role: string;
    userId?: string;
    clientId?: string;
    branchId?: string;
    contractorId?: string;
  }): Observable<TaskSummary> {
    return this.http.get<TaskSummary>(`${this.base}/my-summary`, {
      params: this.toParams(params),
    });
  }

  getMyItems(params: {
    role: string;
    userId?: string;
    clientId?: string;
    branchId?: string;
    contractorId?: string;
    status?: string;
  }): Observable<SystemTask[]> {
    return this.http.get<SystemTask[]>(`${this.base}/my-items`, {
      params: this.toParams(params),
    });
  }

  getOverdueItems(params: {
    role: string;
    userId?: string;
    clientId?: string;
    branchId?: string;
    contractorId?: string;
  }): Observable<SystemTask[]> {
    return this.http.get<SystemTask[]>(`${this.base}/my-overdue`, {
      params: this.toParams(params),
    });
  }

  getExpiringItems(params: {
    role: string;
    userId?: string;
    clientId?: string;
    branchId?: string;
    contractorId?: string;
    withinDays?: number;
  }): Observable<SystemTask[]> {
    return this.http.get<SystemTask[]>(`${this.base}/my-expiring`, {
      params: this.toParams(params),
    });
  }

  private toParams(obj: Record<string, any>): HttpParams {
    let p = new HttpParams();
    Object.entries(obj).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        p = p.set(k, String(v));
      }
    });
    return p;
  }
}
