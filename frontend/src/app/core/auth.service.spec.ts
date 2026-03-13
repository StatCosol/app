import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const mockHttp = { post: vi.fn(), get: vi.fn() } as any;
  const mockRouter = { navigate: vi.fn().mockResolvedValue(true) } as any;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    service = new AuthService(mockHttp, mockRouter);
  });

  describe('getAccessToken', () => {
    it('returns empty string when no token stored', () => {
      expect(service.getAccessToken()).toBe('');
    });

    it('returns token from sessionStorage', () => {
      sessionStorage.setItem('accessToken', 'tok123');
      expect(service.getAccessToken()).toBe('tok123');
    });
  });

  describe('getRefreshToken', () => {
    it('returns empty string when no token stored', () => {
      expect(service.getRefreshToken()).toBe('');
    });

    it('returns refresh token from sessionStorage', () => {
      sessionStorage.setItem('refreshToken', 'ref456');
      expect(service.getRefreshToken()).toBe('ref456');
    });
  });

  describe('getUser', () => {
    it('returns null when no user stored', () => {
      expect(service.getUser()).toBeNull();
    });

    it('parses stored JSON user', () => {
      const user = { id: '1', email: 'a@b.com', roleCode: 'ADMIN' };
      sessionStorage.setItem('user', JSON.stringify(user));
      expect(service.getUser()).toEqual(user);
    });

    it('returns null for invalid JSON', () => {
      sessionStorage.setItem('user', 'not-json');
      expect(service.getUser()).toBeNull();
    });
  });

  describe('isLoggedIn', () => {
    it('returns false when no token and no user', () => {
      expect(service.isLoggedIn()).toBe(false);
    });

    it('returns false when only token exists', () => {
      sessionStorage.setItem('accessToken', 'tok');
      expect(service.isLoggedIn()).toBe(false);
    });

    it('returns true when both token and user exist', () => {
      sessionStorage.setItem('accessToken', 'tok');
      sessionStorage.setItem('user', '{"id":"1"}');
      expect(service.isLoggedIn()).toBe(true);
    });
  });

  describe('getRoleCode', () => {
    it('returns empty string when no user', () => {
      expect(service.getRoleCode()).toBe('');
    });

    it('returns the role code from stored user', () => {
      sessionStorage.setItem('user', '{"roleCode":"CRM"}');
      expect(service.getRoleCode()).toBe('CRM');
    });
  });

  describe('isValidRole', () => {
    it('recognises valid roles', () => {
      expect(service.isValidRole('ADMIN')).toBe(true);
      expect(service.isValidRole('CRM')).toBe(true);
      expect(service.isValidRole('EMPLOYEE')).toBe(true);
    });

    it('rejects invalid roles', () => {
      expect(service.isValidRole('UNKNOWN')).toBe(false);
      expect(service.isValidRole('')).toBe(false);
      expect(service.isValidRole(undefined)).toBe(false);
    });
  });

  describe('isMasterUser / isBranchUser', () => {
    it('isMasterUser returns false for non-CLIENT', () => {
      sessionStorage.setItem('user', '{"roleCode":"ADMIN"}');
      expect(service.isMasterUser()).toBe(false);
    });

    it('isMasterUser returns true for CLIENT with MASTER userType', () => {
      sessionStorage.setItem('user', '{"roleCode":"CLIENT","userType":"MASTER","branchIds":[]}');
      expect(service.isMasterUser()).toBe(true);
    });

    it('isBranchUser returns true for CLIENT with BRANCH userType', () => {
      sessionStorage.setItem('user', '{"roleCode":"CLIENT","userType":"BRANCH","branchIds":["b1"]}');
      expect(service.isBranchUser()).toBe(true);
    });

    it('isBranchUser returns false for non-CLIENT', () => {
      sessionStorage.setItem('user', '{"roleCode":"ADMIN"}');
      expect(service.isBranchUser()).toBe(false);
    });
  });

  describe('getRoleRedirectPath', () => {
    it('returns correct paths for each role', () => {
      expect(service.getRoleRedirectPath('ADMIN')).toBe('/admin');
      expect(service.getRoleRedirectPath('CEO')).toBe('/ceo');
      expect(service.getRoleRedirectPath('CCO')).toBe('/cco');
      expect(service.getRoleRedirectPath('CRM')).toBe('/crm');
      expect(service.getRoleRedirectPath('AUDITOR')).toBe('/auditor');
      expect(service.getRoleRedirectPath('CONTRACTOR')).toBe('/contractor');
      expect(service.getRoleRedirectPath('PAYROLL')).toBe('/payroll');
      expect(service.getRoleRedirectPath('EMPLOYEE')).toBe('/ess');
    });

    it('returns empty string for unknown role', () => {
      expect(service.getRoleRedirectPath('UNKNOWN')).toBe('');
    });

    it('returns /client for CLIENT master user', () => {
      sessionStorage.setItem('user', '{"roleCode":"CLIENT","userType":"MASTER","branchIds":[]}');
      expect(service.getRoleRedirectPath('CLIENT')).toBe('/client');
    });

    it('returns /branch for CLIENT branch user', () => {
      sessionStorage.setItem('user', '{"roleCode":"CLIENT","userType":"BRANCH","branchIds":["b1"]}');
      expect(service.getRoleRedirectPath('CLIENT')).toBe('/branch');
    });
  });

  describe('authenticateUrl', () => {
    it('returns empty url unchanged', () => {
      expect(service.authenticateUrl('')).toBe('');
    });

    it('appends token with ? separator', () => {
      sessionStorage.setItem('accessToken', 'mytoken');
      expect(service.authenticateUrl('/api/file')).toBe('/api/file?token=mytoken');
    });

    it('appends token with & separator when url has query', () => {
      sessionStorage.setItem('accessToken', 'mytoken');
      expect(service.authenticateUrl('/api/file?id=1')).toBe('/api/file?id=1&token=mytoken');
    });
  });

  describe('getBranchIds', () => {
    it('returns empty array when no user', () => {
      expect(service.getBranchIds()).toEqual([]);
    });

    it('returns branch ids from user', () => {
      sessionStorage.setItem('user', '{"branchIds":["a","b"]}');
      expect(service.getBranchIds()).toEqual(['a', 'b']);
    });
  });

  describe('logout', () => {
    it('clears session storage on logout', () => {
      sessionStorage.setItem('accessToken', 'tok');
      sessionStorage.setItem('refreshToken', 'ref');
      sessionStorage.setItem('user', '{"id":"1"}');

      mockHttp.post = vi.fn().mockReturnValue({ subscribe: vi.fn() });

      service.logout();

      expect(sessionStorage.getItem('accessToken')).toBeNull();
      expect(sessionStorage.getItem('refreshToken')).toBeNull();
      expect(sessionStorage.getItem('user')).toBeNull();
    });
  });
});
