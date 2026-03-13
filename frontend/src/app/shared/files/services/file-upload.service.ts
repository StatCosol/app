import { Injectable } from '@angular/core';
import { HttpClient, HttpRequest, HttpEventType } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface UploadProgress {
  progress: number;
  result?: any;
}

/**
 * Low-level upload helper that wraps HttpClient with reportProgress
 * so callers get progress percentage + final result.
 */
@Injectable({ providedIn: 'root' })
export class FileUploadService {
  constructor(private http: HttpClient) {}

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
}
