import { Injectable } from '@angular/core';
import { HttpClient, HttpRequest, HttpEventType } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AzureBlobService } from './azure-blob.service';

export interface UploadProgress {
  progress: number;
  result?: any;
}

/**
 * Low-level upload helper that wraps HttpClient with reportProgress
 * so callers get progress percentage + final result.
 *
 * Supports two modes:
 * - Legacy: POST FormData to backend endpoint
 * - Azure Blob: Direct-to-Azure upload via SAS token
 */
@Injectable({ providedIn: 'root' })
export class FileUploadService {
  constructor(private http: HttpClient, private blobService: AzureBlobService) {}

  /**
   * POST FormData to the given URL while reporting upload progress.
   * @param url  Target endpoint (relative or absolute)
   * @param formData  FormData with file(s) + extra fields
   * @returns Observable emitting { progress: 0–100, result? }
   */
  upload(url: string, formData: FormData): Observable<UploadProgress> {
    const req = new HttpRequest('POST', url, formData, { reportProgress: true });

    return this.http.request(req).pipe(
      map(event => {
        if (event.type === HttpEventType.UploadProgress) {
          const total = event.total || 1;
          return { progress: Math.round((event.loaded / total) * 100) };
        }
        if (event.type === HttpEventType.Response) {
          return { progress: 100, result: event.body };
        }
        return { progress: 0 };
      }),
    );
  }

  /**
   * Upload a file directly to Azure Blob Storage via SAS token.
   * @param file    The File object to upload
   * @param folder  Optional blob container folder prefix
   * @returns Observable emitting { progress: 0–100, result? }
   */
  uploadToAzure(file: File, folder?: string): Observable<UploadProgress> {
    return this.blobService.upload(file, folder).pipe(
      map(bp => ({
        progress: bp.progress,
        result: bp.result,
      })),
    );
  }
}
