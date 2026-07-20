import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, tap } from 'rxjs';
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
    // Open the tab synchronously while the click's user activation is still
    // valid; navigating it after the authenticated fetch avoids the popup
    // blocker turning every View into a download.
    const viewer = window.open('', '_blank');
    return this.fetch(url, preferredFileName).pipe(
      map((file) => {
        if (viewer && !viewer.closed) {
          viewer.location.href = file.objectUrl;
        } else {
          const opened = window.open(file.objectUrl, '_blank', 'noopener,noreferrer');
          if (!opened) {
            this.triggerDownload(file.objectUrl, file.fileName);
          }
        }
        window.setTimeout(() => file.revoke(), 5 * 60 * 1000);
      }),
      tap({
        error: () => {
          if (viewer && !viewer.closed) viewer.close();
        },
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
    const downloadUrl = this.downloadUrlForStorageKey(url);
    if (downloadUrl) return `${this.baseUrl}${downloadUrl}`;
    return `${this.baseUrl}${this.toAppUrl(url)}`;
  }

  /**
   * Non-API relative values are protected storage keys (e.g.
   * `mcd-evidence/...`, `/app/uploads/compliance/...`); the backend only
   * serves those below the JWT-protected /uploads/ route.
   */
  private toAppUrl(url: string): string {
    const normalizedInput = String(url).replace(/\\/g, '/');
    const withSlash = normalizedInput.startsWith('/') ? normalizedInput : `/${normalizedInput}`;
    if (/^\/(api|assets)\//i.test(withSlash)) return withSlash;
    const marker = '/uploads/';
    const markerIndex = normalizedInput.toLowerCase().lastIndexOf(marker);
    const relative =
      markerIndex >= 0
        ? normalizedInput.slice(markerIndex + marker.length)
        : normalizedInput.replace(/^\/?uploads\//i, '').replace(/^\/+/, '');
    return `/uploads/${relative}`;
  }

  private downloadUrlForStorageKey(url: string): string | null {
    if (!url) return null;
    if (/^\/?api\/v\d+\/files\/download\b/i.test(url)) {
      return url.startsWith('/') ? url : `/${url}`;
    }

    const normalizedInput = String(url).replace(/\\/g, '/');
    const marker = '/uploads/';
    const markerIndex = normalizedInput.toLowerCase().lastIndexOf(marker);
    const relative =
      markerIndex >= 0
        ? normalizedInput.slice(markerIndex + marker.length)
        : normalizedInput.replace(/^\/?uploads\//i, '').replace(/^\/+/, '');

    if (!relative || relative.startsWith('api/')) return null;
    // Only prefixes that FilesService.assertCanDownload can authorize; other
    // uploads (e.g. compliance evidence) stay on the JWT-protected /uploads route.
    if (!/^(contractor-documents|payroll-|registers|helpdesk)\//i.test(relative)) {
      return null;
    }
    return `/api/v1/files/download?p=${encodeURIComponent(relative)}`;
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
