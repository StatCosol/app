import { portalBaseUrl, portalUrl } from './portal-url';

/**
 * portalBaseUrl()/portalUrl() build outbound links from FRONTEND_URL. Env is
 * saved/restored around each test so it never leaks.
 */
describe('portal-url', () => {
  const original = process.env.FRONTEND_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original;
  });

  it('uses FRONTEND_URL and strips a trailing slash', () => {
    process.env.FRONTEND_URL = 'https://app.example.com/';
    expect(portalBaseUrl()).toBe('https://app.example.com');
  });

  it('falls back to the default when FRONTEND_URL is unset', () => {
    delete process.env.FRONTEND_URL;
    expect(portalBaseUrl()).toBe('https://app.statcosol.com');
  });

  it('joins a path with exactly one leading slash', () => {
    process.env.FRONTEND_URL = 'https://app.example.com';
    expect(portalUrl('/dashboard')).toBe('https://app.example.com/dashboard');
    expect(portalUrl('dashboard')).toBe('https://app.example.com/dashboard');
  });
});
