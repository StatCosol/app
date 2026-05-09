import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UploadedFileResponse {
  fileName: string;
  originalName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
}

@Injectable({ providedIn: 'root' })
export class ReturnsUploadService {
  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private http: HttpClient) {}

  uploadProof(file: File): Observable<UploadedFileResponse> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<UploadedFileResponse>(
      `${this.baseUrl}/api/v1/returns/upload/proof`,
      fd,
    );
  }
}
