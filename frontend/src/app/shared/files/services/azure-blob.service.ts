import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpRequest, HttpEventType } from '@angular/common/http';
import { Observable, switchMap, map } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface BlobSasToken {
  /** Full SAS URL for direct upload to Azure Blob */
  sasUrl: string;
  /** The blob name / key assigned by the backend */
  blobName: string;
  /** The final accessible URL (CDN or blob endpoint) */
  fileUrl: string;
}

export interface BlobUploadProgress {
  progress: number;
  result?: { fileUrl: string; blobName: string };
}

/**
 * Azure Blob Storage upload service.
 *
 * Flow:
 * 1. Frontend requests a SAS token from the backend (POST /api/v1/files/sas-token)
 * 2. Backend generates a short-lived SAS URL with write permissions
 * 3. Frontend uploads the file directly to Azure Blob using the SAS URL
 * 4. Frontend notifies the backend that upload is complete (POST /api/v1/files/confirm)
 *
 * This approach avoids routing large file payloads through the backend.
 */
@Injectable({ providedIn: 'root' })
export class AzureBlobService {
  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private http: HttpClient) {}

  /**
   * Request a SAS token from the backend for uploading a file.
   * @param fileName  Original file name (used for extension / content-type)
   * @param folder    Optional folder/container path prefix
   */
  requestSasToken(fileName: string, folder?: string): Observable<BlobSasToken> {
    return this.http.post<BlobSasToken>(
      `${this.baseUrl}/api/v1/files/sas-token`,
      { fileName, folder },
    );
  }

  /**
   * Upload a file directly to Azure Blob Storage using the SAS URL.
   * Reports progress percentage.
   */
  uploadToBlob(sasUrl: string, file: File): Observable<BlobUploadProgress> {
    const headers = new HttpHeaders({
      'x-ms-blob-type': 'BlockBlob',
      'Content-Type': file.type || 'application/octet-stream',
    });

    const req = new HttpRequest('PUT', sasUrl, file, {
      headers,
      reportProgress: true,
    });

    return this.http.request(req).pipe(
      map(event => {
        if (event.type === HttpEventType.UploadProgress) {
          const total = event.total || 1;
          return { progress: Math.round((event.loaded / total) * 100) };
        }
        if (event.type === HttpEventType.Response) {
          return { progress: 100 };
        }
        return { progress: 0 };
      }),
    );
  }

  /**
   * Confirm upload completion with the backend.
   * The backend will verify the blob exists and record metadata.
   */
  confirmUpload(blobName: string, originalName: string, sizeBytes: number, mimeType: string): Observable<{ fileUrl: string; fileId: string }> {
    return this.http.post<{ fileUrl: string; fileId: string }>(
      `${this.baseUrl}/api/v1/files/confirm`,
      { blobName, originalName, sizeBytes, mimeType },
    );
  }

  /**
   * Full upload flow: request SAS → upload to blob → confirm.
   * Returns progress updates and final result.
   */
  upload(file: File, folder?: string): Observable<BlobUploadProgress> {
    return this.requestSasToken(file.name, folder).pipe(
      switchMap(sas =>
        this.uploadToBlob(sas.sasUrl, file).pipe(
          switchMap(progress => {
            if (progress.progress === 100) {
              return this.confirmUpload(sas.blobName, file.name, file.size, file.type).pipe(
                map(result => ({
                  progress: 100,
                  result: { fileUrl: result.fileUrl, blobName: sas.blobName },
                })),
              );
            }
            return [progress];
          }),
        ),
      ),
    );
  }

  /**
   * Get a download URL for a blob (may require backend to generate a read SAS).
   */
  getDownloadUrl(blobName: string): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(
      `${this.baseUrl}/api/v1/files/download-url`,
      { params: { blobName } },
    );
  }

  /**
   * Delete a blob via the backend.
   */
  deleteBlob(blobName: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.baseUrl}/api/v1/files/${encodeURIComponent(blobName)}`,
    );
  }
}
