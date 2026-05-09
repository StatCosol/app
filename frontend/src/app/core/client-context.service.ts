import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, tap, catchError, shareReplay } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface ClientContext {
  id: string;
  clientName: string;
  clientCode: string;
}

@Injectable({ providedIn: 'root' })
export class ClientContextService {
  private cache = new Map<string, ClientContext>();
  private inflight = new Map<string, Observable<ClientContext | null>>();

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
  ) {}

  /**
   * Resolve client name + code for a given clientId.
   * Uses an in-memory cache to avoid repeat API calls within a session.
   */
  resolve(clientId: string): Observable<ClientContext | null> {
    if (!clientId) return of(null);

    const cached = this.cache.get(clientId);
    if (cached) return of(cached);

    const existing = this.inflight.get(clientId);
    if (existing) return existing;

    const role = this.auth.getRoleCode();
    let url: string;

    if (role === 'CRM') {
      url = `${environment.apiBaseUrl}/api/v1/crm/clients/assigned`;
    } else if (role === 'AUDITOR') {
      url = `${environment.apiBaseUrl}/api/v1/auditor/audits`;
    } else if (role === 'PAYROLL') {
      url = `${environment.apiBaseUrl}/api/v1/payroll/clients`;
    } else {
      url = `${environment.apiBaseUrl}/api/v1/admin/clients`;
    }

    const req$ = this.http.get<any[]>(url).pipe(
      map((items) => {
        let match: any;
        if (role === 'AUDITOR') {
          match = items.find((a: any) => a.clientId === clientId);
          if (match) {
            return {
              id: clientId,
              clientName: match.client?.clientName || match.clientName || '',
              clientCode: match.client?.clientCode || match.clientCode || '',
            } as ClientContext;
          }
        }
        match = items.find(
          (c: any) => c.id === clientId || c.clientId === clientId,
        );
        if (match) {
          return {
            id: clientId,
            clientName: match.clientName || match.name || '',
            clientCode: match.clientCode || '',
          } as ClientContext;
        }
        return null;
      }),
      tap((ctx) => {
        if (ctx) this.cache.set(clientId, ctx);
        this.inflight.delete(clientId);
      }),
      catchError(() => {
        this.inflight.delete(clientId);
        return of(null);
      }),
      shareReplay(1),
    );

    this.inflight.set(clientId, req$);
    return req$;
  }

  /** Manually set context (e.g. when data is already available in a component). */
  set(ctx: ClientContext): void {
    this.cache.set(ctx.id, ctx);
  }

  /** Clear cached data. */
  clear(): void {
    this.cache.clear();
    this.inflight.clear();
  }
}
