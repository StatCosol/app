import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CrmService {
  private readonly baseUrl = environment.apiBaseUrl || '';

  constructor(
    private http: HttpClient,
    private auth: AuthService,
  ) {}

  /** List of clients assigned to the logged-in CRM user. */
  getAssignedClients(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/v1/crm/clients/assigned`);
  }

  /** Fetch current assignments; do not retain another session's client list. */
  getAssignedClientsCached(): Observable<any[]> {
    return this.getAssignedClients().pipe(takeUntil(this.auth.sessionReset$));
  }

  /** Force-clear the cached clients (e.g., after assignment changes). */
  clearCache(): void {
    // Kept for existing callers; assignments are fetched fresh.
  }
}
