import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ComplianceService {
  private baseUrl = environment.apiBaseUrl;
  private crmBase = `${this.baseUrl}/api/crm/compliance-tasks`;
  private contractorBase = `${this.baseUrl}/api/contractor/compliance`;
  private auditorBase = `${this.baseUrl}/api/auditor/compliance`;
  private crmDashboardUrl = `${this.baseUrl}/api/crm/dashboard`;
  private contractorDashboardUrl = `${this.baseUrl}/api/contractor/dashboard`;
  private clientDashboardUrl = `${this.baseUrl}/api/client/dashboard`;
  private adminDashboardUrl = `${this.baseUrl}/api/admin/dashboard`;

  constructor(private http: HttpClient) {}

  // CRM
  crmCreateTask(payload: any): Observable<any> {
    return this.http.post(`${this.crmBase}/tasks`, payload);
  }

  crmListTasks(params: any): Observable<any> {
    let p = new HttpParams();
    Object.keys(params || {}).forEach((k) => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        p = p.set(k, String(params[k]));
      }
    });
    return this.http.get(`${this.crmBase}/tasks`, { params: p });
  }

  crmTaskDetail(id: string): Observable<any> {
    return this.http.get(`${this.crmBase}/tasks/${id}`);
  }

  crmAssign(id: string, assignedToUserId: string): Observable<any> {
    return this.http.patch(`${this.crmBase}/tasks/${id}/assign`, {
      assignedToUserId,
    });
  }

  crmApprove(id: string, remarks?: string): Observable<any> {
    return this.http.post(`${this.crmBase}/tasks/${id}/approve`, { remarks });
  }

  crmReject(id: string, remarks: string): Observable<any> {
    return this.http.post(`${this.crmBase}/tasks/${id}/reject`, { remarks });
  }

  crmDashboard(): Observable<any> {
    return this.http.get(this.crmDashboardUrl);
  }

  // Auditor
  auditorListTasks(params: any): Observable<any> {
    let p = new HttpParams();
    Object.keys(params || {}).forEach((k) => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        p = p.set(k, String(params[k]));
      }
    });
    return this.http.get(`${this.auditorBase}/tasks`, { params: p });
  }

  auditorTaskDetail(id: string): Observable<any> {
    return this.http.get(`${this.auditorBase}/tasks/${id}`);
  }

  auditorShareReport(id: string, notes: string): Observable<any> {
    return this.http.post(`${this.auditorBase}/tasks/${id}/report`, { notes });
  }

  // Contractor
  contractorListTasks(params: any): Observable<any> {
    let p = new HttpParams();
    Object.keys(params || {}).forEach((k) => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        p = p.set(k, String(params[k]));
      }
    });
    return this.http.get(`${this.contractorBase}/tasks`, { params: p });
  }

  contractorStart(id: string): Observable<any> {
    return this.http.post(`${this.contractorBase}/tasks/${id}/start`, {});
  }

  contractorSubmit(id: string): Observable<any> {
    return this.http.post(`${this.contractorBase}/tasks/${id}/submit`, {});
  }

  contractorComment(id: string, message: string): Observable<any> {
    return this.http.post(`${this.contractorBase}/tasks/${id}/comment`, {
      message,
    });
  }

  contractorUploadEvidence(
    id: string,
    file: File,
    notes?: string,
  ): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    if (notes) fd.append('notes', notes);
    return this.http.post(`${this.contractorBase}/tasks/${id}/evidence`, fd);
  }

  contractorDashboard(): Observable<any> {
    return this.http.get(this.contractorDashboardUrl);
  }

  clientDashboard(): Observable<any> {
    return this.http.get(this.clientDashboardUrl);
  }

  adminDashboard(): Observable<any> {
    return this.http.get(this.adminDashboardUrl);
  }

  contractorTaskDetail(id: string): Observable<any> {
    // Backend currently does not implement GET /api/contractor/compliance/tasks/:id
    // So we load the list and pick the requested task.
    return this.contractorListTasks({}).pipe(
      map((res: any) => {
        const list = res?.data || res || [];
        const task = list.find((t: any) => String(t.id) === String(id));
        return { task };
      }),
    );
  }
}

