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
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/v1/crm/contractors/register`, data);
  }

  listMyContractors(): Observable<any> {
    return this.http.get(`${this.baseUrl}/api/v1/crm/contractors/my-contractors`);
  }
}
