import { PF_TEAM_ROUTES } from './pf-team.routes';

describe('PF_TEAM_ROUTES', () => {
  const root = PF_TEAM_ROUTES[0];

  it('should define a root route at "pf-team"', () => {
    expect(root.path).toBe('pf-team');
    expect(root.loadComponent).toBeDefined();
    expect(root.canActivate).toBeDefined();
  });

  it('should have children routes for dashboard and tickets', () => {
    const childPaths = (root.children ?? []).map((c) => c.path);
    expect(childPaths).toContain('dashboard');
    expect(childPaths).toContain('tickets');
    expect(childPaths).toContain('tickets/:id');
  });

  it('should redirect empty path to dashboard', () => {
    const fallback = (root.children ?? []).find((c) => c.path === '' && c.redirectTo === 'dashboard');
    expect(fallback).toBeTruthy();
  });
});
