import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { shareReplay, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CrmService {
  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(private http: HttpClient) {}

  private assignedClients$?: Observable<any[]>;

  /** List of clients assigned to the logged-in CRM user (cached). */
  getAssignedClients(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/crm/clients/assigned`);
  }

  /** Cached getter — caches on success, invalidates on error so next call retries.
   *  Uses shareReplay(1) WITHOUT refCount so cache persists across guard/component lifecycles. */
  getAssignedClientsCached(): Observable<any[]> {
    if (!this.assignedClients$) {
      this.assignedClients$ = this.getAssignedClients().pipe(
        catchError((err) => {
          this.assignedClients$ = undefined; // clear ref so next call retries
          return throwError(() => err);
        }),
        shareReplay(1),
      );
    }
    return this.assignedClients$;
  }

  /** Force-clear the cached clients (e.g., after assignment changes). */
  clearCache(): void {
    this.assignedClients$ = undefined;
  }
}
