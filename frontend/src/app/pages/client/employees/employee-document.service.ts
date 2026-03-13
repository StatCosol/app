import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  docType: string;
  docName: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  isVerified: boolean;
  expiryDate: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class EmployeeDocumentService {
  private base = `${environment.apiBaseUrl}/api/v1/employees/documents`;

  constructor(private http: HttpClient) {}

  list(employeeId: string): Observable<EmployeeDocument[]> {
    return this.http.get<EmployeeDocument[]>(`${this.base}/${employeeId}`);
  }

  upload(employeeId: string, file: File, docType: string, docName: string, expiryDate?: string): Observable<EmployeeDocument> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('docType', docType);
    fd.append('docName', docName);
    if (expiryDate) fd.append('expiryDate', expiryDate);
    return this.http.post<EmployeeDocument>(`${this.base}/${employeeId}/upload`, fd);
  }

  download(docId: string): Observable<Blob> {
    return this.http.get(`${this.base}/download/${docId}`, { responseType: 'blob' });
  }

  verify(docId: string): Observable<EmployeeDocument> {
    return this.http.post<EmployeeDocument>(`${this.base}/${docId}/verify`, {});
  }

  remove(docId: string): Observable<any> {
    return this.http.delete(`${this.base}/${docId}`);
  }
}
