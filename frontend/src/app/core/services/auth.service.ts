import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { Router } from '@angular/router';

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name?: string;
    email: string;
    role: string;
  };
}

interface RefreshResponse {
  accessToken: string;
  refreshToken?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly baseUrl = '/api/v1/auth';
  private readonly accessTokenKey = 'access_token';
  private readonly refreshTokenKey = 'refresh_token';
  private readonly userKey = 'auth_user';

  login(payload: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/login`, payload).pipe(
      tap((response) => {
        this.setSession(response);
      }),
    );
  }

  logout(): Observable<any> {
    return this.http.post(`${this.baseUrl}/logout`, {}).pipe(
      tap(() => {
        this.clearSession();
        void this.router.navigate(['/login']);
      }),
    );
  }

  refreshToken(): Observable<RefreshResponse> {
    const refreshToken = this.getRefreshToken();

    return this.http
      .post<RefreshResponse>(`${this.baseUrl}/refresh`, { refreshToken })
      .pipe(
        tap((response) => {
          if (response.accessToken) {
            localStorage.setItem(this.accessTokenKey, response.accessToken);
          }
          if (response.refreshToken) {
            localStorage.setItem(this.refreshTokenKey, response.refreshToken);
          }
        }),
      );
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.accessTokenKey);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.refreshTokenKey);
  }

  getCurrentUser(): LoginResponse['user'] | null {
    const raw = localStorage.getItem(this.userKey);
    return raw ? JSON.parse(raw) : null;
  }

  getCurrentRole(): string | null {
    return this.getCurrentUser()?.role ?? null;
  }

  isLoggedIn(): boolean {
    return !!this.getAccessToken();
  }

  clearSession(): void {
    localStorage.removeItem(this.accessTokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.userKey);
  }

  redirectByRole(role?: string | null): Promise<boolean> {
    const normalized = (role || '').toUpperCase();

    switch (normalized) {
      case 'ADMIN':
        return this.router.navigate(['/admin']);
      case 'CRM':
        return this.router.navigate(['/crm']);
      case 'AUDITOR':
        return this.router.navigate(['/auditor']);
      case 'CEO':
        return this.router.navigate(['/ceo']);
      case 'CCO':
        return this.router.navigate(['/cco']);
      case 'CLIENT':
      case 'LEGITX':
        return this.router.navigate(['/client']);
      case 'BRANCH':
      case 'BRANCH_USER':
      case 'BRANCHDESK':
        return this.router.navigate(['/branch']);
      case 'CONTRACTOR':
      case 'CONTRACK':
        return this.router.navigate(['/contractor']);
      case 'PAYROLL':
      case 'PAYDEK':
        return this.router.navigate(['/payroll']);
      case 'ESS':
        return this.router.navigate(['/ess']);
      default:
        return this.router.navigate(['/dashboard']);
    }
  }

  private setSession(response: LoginResponse): void {
    localStorage.setItem(this.accessTokenKey, response.accessToken);
    localStorage.setItem(this.refreshTokenKey, response.refreshToken);
    localStorage.setItem(this.userKey, JSON.stringify(response.user));
  }
}
