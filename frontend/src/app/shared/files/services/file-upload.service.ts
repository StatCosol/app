import { Injectable } from '@angular/core';
import { HttpClient, HttpEventType, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface UploadProgress {
  progress: number;
  result?: any;
}

@Injectable({ providedIn: 'root' })
export class FileUploadService {
  constructor(private http: HttpClient) {}

  upload(url: string, formData: FormData): Observable<UploadProgress> {
    const req = new HttpRequest('POST', url, formData, {
      reportProgress: true,
    });

    return this.http.request(req).pipe(
      map((event) => {
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
