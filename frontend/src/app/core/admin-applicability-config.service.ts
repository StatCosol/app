import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminApplicabilityConfigService {
  private readonly base = `${environment.apiBaseUrl}/api/v1/admin/applicability-config`;

  constructor(private http: HttpClient) {}

  // Compliance Items
  listComplianceItems(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/compliance-items`);
  }

  createComplianceItem(data: any): Observable<any> {
    return this.http.post(`${this.base}/compliance-items`, data);
  }

  updateComplianceItem(id: string, data: any): Observable<any> {
    return this.http.put(`${this.base}/compliance-items/${id}`, data);
  }

  deleteComplianceItem(id: string): Observable<any> {
    return this.http.delete(`${this.base}/compliance-items/${id}`);
  }

  bulkUploadComplianceItems(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.base}/compliance-items/bulk-upload`, formData);
  }

  downloadComplianceTemplate(): Observable<Blob> {
    return this.http.get(`${this.base}/compliance-items/template/download`, { responseType: 'blob' });
  }

  // Packages
  listPackages(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/packages`);
  }

  createPackage(data: any): Observable<any> {
    return this.http.post(`${this.base}/packages`, data);
  }

  updatePackage(id: string, data: any): Observable<any> {
    return this.http.put(`${this.base}/packages/${id}`, data);
  }

  deletePackage(id: string): Observable<any> {
    return this.http.delete(`${this.base}/packages/${id}`);
  }

  // Package Items
  listPackageItems(packageId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/packages/${packageId}/items`);
  }

  addPackageItem(packageId: string, complianceId: string): Observable<any> {
    return this.http.post(`${this.base}/packages/${packageId}/items`, { complianceId });
  }

  bulkAddPackageItems(packageId: string, complianceIds: string[]): Observable<any> {
    return this.http.post(`${this.base}/packages/${packageId}/items/bulk`, { complianceIds });
  }

  removePackageItem(packageId: string, id: string): Observable<any> {
    return this.http.delete(`${this.base}/packages/${packageId}/items/${id}`);
  }

  // Rules
  listRules(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/rules`);
  }

  createRule(data: any): Observable<any> {
    return this.http.post(`${this.base}/rules`, data);
  }

  updateRule(id: string, data: any): Observable<any> {
    return this.http.put(`${this.base}/rules/${id}`, data);
  }

  deleteRule(id: string): Observable<any> {
    return this.http.delete(`${this.base}/rules/${id}`);
  }

  // Package Rules
  listPackageRules(packageId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/packages/${packageId}/rules`);
  }

  addPackageRule(packageId: string, ruleId: string): Observable<any> {
    return this.http.post(`${this.base}/packages/${packageId}/rules`, { ruleId });
  }

  bulkAddPackageRules(packageId: string, ruleIds: string[]): Observable<any> {
    return this.http.post(`${this.base}/packages/${packageId}/rules/bulk`, { ruleIds });
  }

  removePackageRule(packageId: string, id: string): Observable<any> {
    return this.http.delete(`${this.base}/packages/${packageId}/rules/${id}`);
  }
}
