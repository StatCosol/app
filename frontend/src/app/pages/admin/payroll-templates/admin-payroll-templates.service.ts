import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AdminPayrollTemplateComponent {
  id: string;
  code?: string;
  label?: string;
  type?: string;
  input_type?: string;
  default_value?: number | null;
  is_taxable?: boolean;
  is_statutory?: boolean;
  formula_expression?: string | null;
  order_no?: number;
}

export interface AdminPayrollTemplate {
  id: string;
  name: string;
  version: number;
  is_active: boolean;
  fileName: string;
  filePath: string;
  fileType?: string | null;
  created_at?: string;
  updated_at?: string;
  components?: AdminPayrollTemplateComponent[];
}

@Injectable({ providedIn: 'root' })
export class AdminPayrollTemplatesService {
  private readonly base = '/api/v1/admin/payroll';

  constructor(private readonly http: HttpClient) {}

  getTemplates(): Observable<{ items: AdminPayrollTemplate[]; total: number }> {
    return this.http.get<{ items: AdminPayrollTemplate[]; total: number }>(
      `${this.base}/templates`,
    );
  }

  getTemplateById(id: string): Observable<AdminPayrollTemplate> {
    return this.http.get<AdminPayrollTemplate>(`${this.base}/templates/${id}`);
  }

  createTemplate(payload: {
    name: string;
    fileName: string;
    filePath: string;
    fileType?: string;
    version?: number;
    is_active?: boolean;
  }): Observable<AdminPayrollTemplate> {
    return this.http.post<AdminPayrollTemplate>(`${this.base}/templates`, payload);
  }

  updateTemplate(
    id: string,
    payload: Partial<{
      name: string;
      fileName: string;
      filePath: string;
      fileType: string;
      version: number;
      is_active: boolean;
    }>,
  ): Observable<AdminPayrollTemplate> {
    return this.http.patch<AdminPayrollTemplate>(`${this.base}/templates/${id}`, payload);
  }

  assignTemplateToClient(payload: {
    client_id: string;
    template_id: string;
    effective_from: string;
    effective_to?: string;
  }): Observable<any> {
    return this.http.post(`${this.base}/templates/assign`, payload);
  }

  getClientAssignments(clientId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/templates/client/${clientId}`);
  }

  getClients(): Observable<any> {
    return this.http.get('/api/v1/admin/clients');
  }
}

