import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, map } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';

/** Valid role codes returned by the backend */
const VALID_ROLES = ['ADMIN', 'CEO', 'CCO', 'CRM', 'AUDITOR', 'CLIENT', 'CONTRACTOR', 'PAYROLL', 'EMPLOYEE'] as const;
type RoleCode = (typeof VALID_ROLES)[number];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'accessToken';
  private readonly REFRESH_KEY = 'refreshToken';
  private readonly USER_KEY = 'user';

  // prevents "dual logout" / multiple navigations
  private loggingOut = false;

  constructor(private http: HttpClient, private router: Router) {
    // Migrate any tokens from localStorage to sessionStorage (one-time)
    this.migrateFromLocalStorage();
  }

  login(email: string, password: string) {
    return this.http
      .post<any>(`${environment.apiBaseUrl}/api/v1/auth/login`, { email, password })
      .pipe(
        tap((res) => {
          const user = res?.user || {};
          const normalizedUser = {
            ...user,
            userType:
              user?.roleCode === 'CLIENT'
                ? (user?.userType ?? ((user?.branchIds?.length ?? 0) > 0 ? 'BRANCH' : 'MASTER'))
                : (user?.userType ?? null),
            isMasterUser:
              user?.roleCode === 'CLIENT'
                ? (user?.isMasterUser ?? !((user?.branchIds?.length ?? 0) > 0))
                : (user?.isMasterUser ?? false),
            branchIds: user?.branchIds ?? [],
          };

          sessionStorage.setItem(this.TOKEN_KEY, res.accessToken);
          sessionStorage.setItem(this.REFRESH_KEY, res.refreshToken);
          sessionStorage.setItem(this.USER_KEY, JSON.stringify(normalizedUser));
        })
      );
  }

  /** ESS-specific login: company code + email + password */
  essLogin(companyCode: string, email: string, password: string) {
    return this.http
      .post<any>(`${environment.apiBaseUrl}/api/v1/auth/ess/login`, { companyCode, email, password })
      .pipe(
        tap((res) => {
          sessionStorage.setItem(this.TOKEN_KEY, res.accessToken);
          sessionStorage.setItem(this.REFRESH_KEY, res.refreshToken);
          sessionStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
        })
      );
  }

  /** Call this from UI logout button */
  logout(reason?: string) {
    const wasEmployee =
      this.getRoleCode() === 'EMPLOYEE' ||
      window.location.pathname.startsWith('/ess/');

    // Notify the backend to revoke the refresh token family
    const refreshToken = this.getRefreshToken();
    if (refreshToken) {
      this.http
        .post(`${environment.apiBaseUrl}/api/v1/auth/logout`, { refreshToken })
        .subscribe({ error: () => { /* best-effort */ } });
    }

    this.logoutOnce(reason, wasEmployee);
  }

  /** Call this from interceptor on 401 */
  logoutOnce(_reason?: string, toEssLogin = false) {
    if (this.loggingOut) return;
    this.loggingOut = true;

    // Clear all auth state BEFORE navigation
    this.clearAuthState();

    const target = toEssLogin ? '/ess/login' : '/login';

    // Replace the current history entry so pressing "Back" won't
    // return to the previous authenticated page.
    window.history.replaceState(null, '', target);

    this.router.navigate([target], { replaceUrl: true }).finally(() => {
      // allow future logout actions after navigation stabilizes
      setTimeout(() => (this.loggingOut = false), 0);
    });
  }

  /** Clears all auth-related keys from storage */
  private clearAuthState(): void {
    sessionStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.REFRESH_KEY);
    sessionStorage.removeItem(this.USER_KEY);
    // Also clear from localStorage in case old tokens linger
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  getAccessToken(): string {
    return sessionStorage.getItem(this.TOKEN_KEY) || '';
  }

  getRefreshToken(): string {
    return sessionStorage.getItem(this.REFRESH_KEY) || '';
  }

  /**
   * Attempt to refresh the access token using the stored refresh token.
   * Returns an observable that emits the new access token, or throws on failure.
   */
  refreshAccessToken(): Observable<string> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return of('');
    }
    return this.http
      .post<any>(`${environment.apiBaseUrl}/api/v1/auth/refresh`, { refreshToken })
      .pipe(
        tap((res) => {
          sessionStorage.setItem(this.TOKEN_KEY, res.accessToken);
          sessionStorage.setItem(this.REFRESH_KEY, res.refreshToken);
        }),
        map((res) => res.accessToken),
      );
  }

  getUser(): any | null {
    const raw = sessionStorage.getItem(this.USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Append the access token as a query parameter to a URL.
   * Use this for `window.open()` calls to authenticated endpoints
   * (e.g. /uploads/...) since window.open doesn't send the Authorization header.
   */
  authenticateUrl(url: string): string {
    if (!url) return url;
    const token = this.getAccessToken();
    if (!token) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(token)}`;
  }

  isLoggedIn(): boolean {
    return !!this.getAccessToken() && !!this.getUser();
  }

  getRoleCode(): string {
    return this.getUser()?.roleCode || '';
  }

  /** Check if the role code is a known valid role */
  isValidRole(role?: string): boolean {
    return VALID_ROLES.includes((role || '') as RoleCode);
  }

  /** True if the logged-in user is a CLIENT master user (no branch mappings) */
  isMasterUser(): boolean {
    const u = this.getUser();
    if (!u || u?.roleCode !== 'CLIENT') return false;
    if (u?.userType === 'MASTER') return true;
    if (u?.userType === 'BRANCH') return false;
    return !u?.branchIds?.length;
  }

  /** True if the logged-in user is a CLIENT branch user (has 1+ branch mappings) */
  isBranchUser(): boolean {
    const u = this.getUser();
    return u?.userType === 'BRANCH' || (!!u?.branchIds?.length && u?.roleCode === 'CLIENT');
  }

  /** Get the branch IDs this user is mapped to (empty for master) */
  getBranchIds(): string[] {
    return this.getUser()?.branchIds ?? [];
  }

  /** Get user type: 'MASTER' | 'BRANCH' | null */
  getUserType(): string | null {
    return this.getUser()?.userType ?? null;
  }

  /**
   * Get the redirect path for a given role code.
   * Single source of truth — used by login component and guards.
   */
  getRoleRedirectPath(role?: string): string {
    const redirects: Record<string, string> = {
      ADMIN: '/admin',
      CEO: '/ceo',
      CCO: '/cco',
      CRM: '/crm',
      AUDITOR: '/auditor',
      CLIENT: this.isBranchUser() ? '/branch' : '/client',
      CONTRACTOR: '/contractor',
      PAYROLL: '/payroll',
      EMPLOYEE: '/ess',
    };
    return redirects[role || ''] || '';
  }

  // ---- Self-service endpoints ----
  fetchMe() {
    return this.http.get<any>(`${environment.apiBaseUrl}/api/v1/me`).pipe(
      tap((me) => {
        const current = this.getUser() || {};

        const branchIds = me?.branchIds ?? current.branchIds ?? [];
        const userType =
          me?.roleCode === 'CLIENT'
            ? (me?.userType ?? ((branchIds?.length ?? 0) > 0 ? 'BRANCH' : 'MASTER'))
            : (me?.userType ?? current.userType ?? null);

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
          userType,
          branchIds,
          isMasterUser:
            me?.roleCode === 'CLIENT'
              ? (me?.isMasterUser ?? ((branchIds?.length ?? 0) === 0))
              : (me?.isMasterUser ?? current.isMasterUser ?? false),
        };
        sessionStorage.setItem(this.USER_KEY, JSON.stringify(merged));
      })
    );
  }

  updateMyProfile(payload: { name?: string; mobile?: string | null }) {
    return this.http.patch<any>(`${environment.apiBaseUrl}/api/v1/me/profile`, payload).pipe(
      tap((me) => {
        const current = this.getUser() || {};
        const merged = { ...current, name: me?.name ?? current.name };
        sessionStorage.setItem(this.USER_KEY, JSON.stringify(merged));
      })
    );
  }

  changeMyPassword(payload: { currentPassword: string; newPassword: string }) {
    return this.http.patch<any>(`${environment.apiBaseUrl}/api/v1/me/password`, payload);
  }

  /**
   * One-time migration: move tokens from localStorage to sessionStorage
   * for users who logged in before this change.
   */
  private migrateFromLocalStorage(): void {
    const keys = [this.TOKEN_KEY, this.REFRESH_KEY, this.USER_KEY];
    for (const key of keys) {
      const val = localStorage.getItem(key);
      if (val && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, val);
      }
      localStorage.removeItem(key);
    }
  }
}
