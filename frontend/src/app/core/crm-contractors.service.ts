import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CrmContractorsService {
  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private http: HttpClient) {}

  registerContractor(data: {
    name: string;
    email: string;
    mobile?: string;
    password: string;
    clientId: string;
    branchIds?: string[];
    scheduledEmployment?: string | null;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/crm/contractors/register`, data);
  }

  listMyContractors(clientId?: string): Observable<any> {
    const params: Record<string, string> = {};
    if (clientId) params['clientId'] = clientId;
    return this.http.get(`${this.baseUrl}/api/v1/crm/contractors/my-contractors`, { params });
  }

  uploadQuotationWages(data: {
    clientId: string;
    contractorUserId: string;
    effectiveFrom: string;
    file: File;
  }): Observable<any> {
    const form = new FormData();
    form.append('clientId', data.clientId);
    form.append('contractorUserId', data.contractorUserId);
    form.append('effectiveFrom', data.effectiveFrom);
    form.append('file', data.file);
    return this.http.post(`${this.baseUrl}/api/v1/crm/contractor-computation/quotations/upload`, form);
  }
}
