import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'accessToken';
  private readonly USER_KEY = 'user';

  // prevents "dual logout" / multiple navigations
  private loggingOut = false;

  constructor(private http: HttpClient, private router: Router) {}

  login(email: string, password: string) {
    return this.http
      .post<any>(`${environment.apiBaseUrl}/api/auth/login`, { email, password })
      .pipe(
        tap((res) => {
          localStorage.setItem(this.TOKEN_KEY, res.accessToken);
          localStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
        })
      );
  }

  /** ESS-specific login: company code + email + password */
  essLogin(companyCode: string, email: string, password: string) {
    return this.http
      .post<any>(`${environment.apiBaseUrl}/api/auth/ess/login`, { companyCode, email, password })
      .pipe(
        tap((res) => {
          localStorage.setItem(this.TOKEN_KEY, res.accessToken);
          localStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
        })
      );
  }

  /** Call this from UI logout button */
  logout(reason?: string) {
    const wasEmployee = this.getRoleCode() === 'EMPLOYEE';
    this.logoutOnce(reason, wasEmployee);
  }

  /** Call this from interceptor on 401 */
  logoutOnce(_reason?: string, toEssLogin = false) {
    if (this.loggingOut) return;
    this.loggingOut = true;

    // Remove only auth keys (avoid nuking other app settings)
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);

    const target = toEssLogin ? '/ess/login' : '/login';
    this.router.navigate([target], { replaceUrl: true }).finally(() => {
      // allow future logout actions after navigation stabilizes
      setTimeout(() => (this.loggingOut = false), 0);
    });
  }

  getAccessToken(): string {
    return localStorage.getItem(this.TOKEN_KEY) || '';
  }

  getUser(): any | null {
    const raw = localStorage.getItem(this.USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  isLoggedIn(): boolean {
    return !!this.getAccessToken() && !!this.getUser();
  }

  getRoleCode(): string {
    return this.getUser()?.roleCode || '';
  }

  /** True if the logged-in user is a CLIENT master user (no branch mappings) */
  isMasterUser(): boolean {
    const u = this.getUser();
    return u?.isMasterUser === true || u?.userType === 'MASTER';
  }

  /** True if the logged-in user is a CLIENT branch user (has 1+ branch mappings) */
  isBranchUser(): boolean {
    const u = this.getUser();
    return u?.userType === 'BRANCH';
  }

  /** Get the branch IDs this user is mapped to (empty for master) */
  getBranchIds(): string[] {
    return this.getUser()?.branchIds ?? [];
  }

  /** Get user type: 'MASTER' | 'BRANCH' | null */
  getUserType(): string | null {
    return this.getUser()?.userType ?? null;
  }

  // ---- Self-service endpoints ----
  fetchMe() {
    return this.http.get<any>(`${environment.apiBaseUrl}/api/me`).pipe(
      tap((me) => {
        // Keep localStorage user in sync (for headers/menus)
        const current = this.getUser() || {};
        const merged = {
          ...current,
          id: me?.id ?? current.id,
          roleId: me?.roleId ?? current.roleId,
          roleCode: me?.roleCode ?? current.roleCode,
          name: me?.name ?? current.name,
          email: me?.email ?? current.email,
          clientId: me?.clientId ?? current.clientId,
          clientName: me?.clientName ?? me?.client?.name ?? current.clientName ?? current.client?.name,
          clientLogoUrl: me?.clientLogoUrl ?? me?.client?.logoUrl ?? current.clientLogoUrl ?? current.client?.logoUrl,
          userType: me?.userType ?? current.userType ?? null,
          branchIds: me?.branchIds ?? current.branchIds ?? [],
          isMasterUser: me?.isMasterUser ?? current.isMasterUser ?? false,
        };
        localStorage.setItem(this.USER_KEY, JSON.stringify(merged));
      })
    );
  }

  updateMyProfile(payload: { name?: string; mobile?: string | null }) {
    return this.http.patch<any>(`${environment.apiBaseUrl}/api/me/profile`, payload).pipe(
      tap((me) => {
        const current = this.getUser() || {};
        const merged = { ...current, name: me?.name ?? current.name };
        localStorage.setItem(this.USER_KEY, JSON.stringify(merged));
      })
    );
  }

  changeMyPassword(payload: { currentPassword: string; newPassword: string }) {
    return this.http.patch<any>(`${environment.apiBaseUrl}/api/me/password`, payload);
  }
}
