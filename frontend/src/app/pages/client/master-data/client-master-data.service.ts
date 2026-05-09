import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface MasterItem {
  id: string;
  clientId: string;
  code: string;
  name: string;
  isActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class ClientMasterDataService {
  private base = `${environment.apiBaseUrl}/api/v1/client/master-data`;

  constructor(private http: HttpClient) {}

  // Departments
  listDepartments(clientId?: string): Observable<MasterItem[]> {
    const params = clientId ? `?clientId=${clientId}` : '';
    return this.http.get<any>(`${this.base}/departments${params}`).pipe(
      map(res => Array.isArray(res) ? res : res?.data ?? []),
    );
  }
  createDepartment(body: Partial<MasterItem>): Observable<MasterItem> {
    return this.http.post<MasterItem>(`${this.base}/departments`, body);
  }
  updateDepartment(id: string, body: Partial<MasterItem>): Observable<MasterItem> {
    return this.http.put<MasterItem>(`${this.base}/departments/${id}`, body);
  }

  // Grades
  listGrades(clientId?: string): Observable<MasterItem[]> {
    const params = clientId ? `?clientId=${clientId}` : '';
    return this.http.get<any>(`${this.base}/grades${params}`).pipe(
      map(res => Array.isArray(res) ? res : res?.data ?? []),
    );
  }
  createGrade(body: Partial<MasterItem>): Observable<MasterItem> {
    return this.http.post<MasterItem>(`${this.base}/grades`, body);
  }
  updateGrade(id: string, body: Partial<MasterItem>): Observable<MasterItem> {
    return this.http.put<MasterItem>(`${this.base}/grades/${id}`, body);
  }

  // Designations
  listDesignations(): Observable<MasterItem[]> {
    return this.http.get<any>(`${this.base}/designations`).pipe(
      map(res => Array.isArray(res) ? res : res?.data ?? []),
    );
  }
  createDesignation(body: Partial<MasterItem>): Observable<MasterItem> {
    return this.http.post<MasterItem>(`${this.base}/designations`, body);
  }
  updateDesignation(id: string, body: Partial<MasterItem>): Observable<MasterItem> {
    return this.http.put<MasterItem>(`${this.base}/designations/${id}`, body);
  }
}
