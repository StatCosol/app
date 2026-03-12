import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { environment } from '../../../environments/environment';

export interface SafetyRequiredDoc {
  docMasterId: number;
  documentName: string;
  category: string;
  frequency: string;
  applicableTo: string;
  isMandatory: boolean;
  dueStatus: 'DUE' | 'UPLOADED' | 'EXPIRED';
  lastUploadedAt?: string;
  lastUploadId?: string;
}

interface SafetyMasterRow {
  id: number;
  document_name: string;
  category: string;
  frequency: string;
  applicable_to: string;
  is_mandatory: boolean;
}

@Injectable({ providedIn: 'root' })
export class BranchSafetyApiService {
  private readonly base = `${environment.apiBaseUrl}/api/v1`;
  private readonly legacyBase = `${environment.apiBaseUrl}/api`;

  constructor(private readonly http: HttpClient) {}

  getRequiredDocs(branchId: string, month?: string): Observable<SafetyRequiredDoc[]> {
    let params = new HttpParams();
    if (month) params = params.set('month', month);

    const legacyUrl = `${this.legacyBase}/branch/${branchId}/safety/required`;
    const versionedUrl = `${this.base}/branch/${branchId}/safety/required`;
    const masterUrl = `${this.base}/branch/safety-documents/master`;

    return this.http.get<SafetyRequiredDoc[]>(legacyUrl, { params }).pipe(
      catchError((legacyErr: any) => {
        if (!this.isNotFound(legacyErr)) return throwError(() => legacyErr);
        return this.http.get<SafetyRequiredDoc[]>(versionedUrl, { params }).pipe(
          catchError((versionedErr: any) => {
            if (!this.isNotFound(versionedErr)) return throwError(() => versionedErr);
            return this.http.get<SafetyMasterRow[]>(masterUrl).pipe(
              map((rows) => (rows || []).map((row) => this.toRequiredDoc(row))),
            );
          }),
        );
      }),
    );
  }

  private toRequiredDoc(row: SafetyMasterRow): SafetyRequiredDoc {
    return {
      docMasterId: Number(row.id || 0),
      documentName: String(row.document_name || 'Safety Document'),
      category: String(row.category || 'General'),
      frequency: String(row.frequency || 'ANNUAL'),
      applicableTo: String(row.applicable_to || 'ALL'),
      isMandatory: !!row.is_mandatory,
      dueStatus: 'DUE',
    };
  }

  private isNotFound(error: any): boolean {
    return Number(error?.status) === 404;
  }
}
