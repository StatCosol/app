import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface ProtectedFileHandle {
  blob: Blob;
  objectUrl: string;
  fileName: string | null;
  mimeType: string;
  revoke: () => void;
}

@Injectable({ providedIn: 'root' })
export class ProtectedFileService {
  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private readonly http: HttpClient) {}

  fetch(url: string, preferredFileName?: string | null): Observable<ProtectedFileHandle> {
    const resolved = this.resolveUrl(url);
    return this.http
      .get(resolved, { observe: 'response', responseType: 'blob' })
      .pipe(
        map((response) => {
          const blob = response.body || new Blob();
          const objectUrl = URL.createObjectURL(blob);
          const dispositionName = this.extractFileName(
            response.headers.get('content-disposition'),
          );
          return {
            blob,
            objectUrl,
            fileName: preferredFileName || dispositionName,
            mimeType: blob.type || response.headers.get('content-type') || '',
            revoke: () => URL.revokeObjectURL(objectUrl),
          };
        }),
      );
  }

  open(url: string, preferredFileName?: string | null): Observable<void> {
    return this.fetch(url, preferredFileName).pipe(
      map((file) => {
        const opened = window.open(file.objectUrl, '_blank', 'noopener,noreferrer');
        if (!opened) {
          this.triggerDownload(file.objectUrl, file.fileName);
        }
        window.setTimeout(() => file.revoke(), 5 * 60 * 1000);
      }),
    );
  }

  download(url: string, preferredFileName?: string | null): Observable<void> {
    return this.fetch(url, preferredFileName).pipe(
      map((file) => {
        this.triggerDownload(file.objectUrl, file.fileName);
        window.setTimeout(() => file.revoke(), 1500);
      }),
    );
  }

  private triggerDownload(objectUrl: string, fileName?: string | null): void {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    if (fileName) {
      anchor.download = fileName;
    }
    anchor.click();
  }

  private resolveUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    const normalized = url.startsWith('/') ? url : `/${url}`;
    return `${this.baseUrl}${normalized}`;
  }

  private extractFileName(header: string | null): string | null {
    if (!header) return null;
    const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1]);
      } catch {
        return utf8Match[1];
      }
    }
    const basicMatch = /filename="?([^"]+)"?/i.exec(header);
    return basicMatch?.[1] || null;
  }
}
