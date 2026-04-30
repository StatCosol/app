const fs = require('fs/promises');
const path = require('path');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.CRAWL_BASE_URL || 'http://localhost:4200';
const API_BASE_URL = process.env.CRAWL_API_BASE_URL || 'http://localhost:3000';
const OUTPUT_PATH =
  process.env.CRAWL_OUTPUT ||
  path.join(__dirname, 'role-crawl-results.json');
const MAX_PAGES_PER_ROLE = Number(process.env.CRAWL_MAX_PAGES || 12);
const BROWSER_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || process.env.SMOKE_ADMIN_EMAIL || 'it_admin@statcosol.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.SMOKE_ADMIN_PASSWORD || '';

const ROLES = [
  { role: 'ADMIN', email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  { role: 'CRM', email: 'compliance@statcosol.com', password: 'Statco@123' },
  { role: 'CCO', email: 'crm_india@statcosol.com', password: 'Statco@123' },
  { role: 'CEO', email: 'mkkallepalli@gmail.com', password: 'Statco@123' },
  { role: 'AUDITOR', email: 'payroll_audit@statcosol.com', password: 'Statco@123' },
  { role: 'CLIENT', email: 'ashok@logiqems.com', password: 'Statco@123' },
  { role: 'CONTRACTOR', email: 'contractor@gmail.com', password: 'Statco@123' },
  { role: 'PF_TEAM', email: 'statcosolutions@gmail.com', password: 'Statco@123' },
];

const EXCLUDED_PATH_PATTERNS = [
  /\/login$/,
  /\/logout$/,
  /\/forgot-password$/,
  /\/uploads\//,
  /\/download(?:$|\/)/,
  /\/export(?:$|\/)/,
  /\.pdf(?:$|\?)/i,
  /\.xlsx?(?:$|\?)/i,
  /\.zip(?:$|\?)/i,
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(value) {
  try {
    const url = new URL(value, BASE_URL);
    if (url.origin !== new URL(BASE_URL).origin) return null;
    url.hash = '';
    const normalized = url.pathname.replace(/\/+$/, '') || '/';
    if (EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

function getRolePrefix(startPath) {
  const parts = (startPath || '/').split('/').filter(Boolean);
  return parts.length ? `/${parts[0]}` : '/';
}

async function collectInternalLinks(page) {
  const hrefs = await page.$$eval('a[href]', (anchors) =>
    anchors.map((anchor) => anchor.href).filter(Boolean),
  );

  return Array.from(new Set(hrefs));
}

function buildUser(loginJson) {
  const user = loginJson?.user || {};
  const branchIds = user?.branchIds ?? [];
  const roleCode = user?.roleCode || '';
  return {
    ...user,
    userType:
      roleCode === 'CLIENT'
        ? (user?.userType ?? (branchIds.length > 0 ? 'BRANCH' : 'MASTER'))
        : (user?.userType ?? null),
    isMasterUser:
      roleCode === 'CLIENT'
        ? (user?.isMasterUser ?? branchIds.length === 0)
        : (user?.isMasterUser ?? false),
    branchIds,
  };
}

function getRoleStartPath(user) {
  const roleCode = user?.roleCode || '';
  const isBranchUser =
    roleCode === 'CLIENT' &&
    (user?.userType === 'BRANCH' || (user?.branchIds?.length ?? 0) > 0);

  const redirects = {
    ADMIN: '/admin',
    CEO: '/ceo',
    CCO: '/cco',
    CRM: '/crm',
    AUDITOR: '/auditor',
    CLIENT: isBranchUser ? '/branch' : '/client',
    CONTRACTOR: '/contractor',
    PAYROLL: '/payroll',
    PF_TEAM: '/pf-team',
    EMPLOYEE: '/ess',
  };
  return redirects[roleCode] || '/login';
}

async function login(credentials) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      const user = buildUser(body);
      return {
        accessToken: body?.accessToken ?? body?.access_token ?? '',
        refreshToken: body?.refreshToken ?? body?.refresh_token ?? '',
        user,
        startPath: getRoleStartPath(user),
      };
    }

    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 65000));
      continue;
    }

    throw new Error(
      `login failed for ${credentials.role}: ${response.status} ${JSON.stringify(body)}`,
    );
  }
}

async function crawlRole(browser, credentials) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 1024 });

  const result = {
    role: credentials.role,
    email: credentials.email,
    loginUrl: null,
    pages: [],
    routeErrors: [],
  };

  let currentPath = '';
  const seenErrorKeys = new Set();

  const recordRouteError = (entry) => {
    const key = JSON.stringify(entry);
    if (seenErrorKeys.has(key)) return;
    seenErrorKeys.add(key);
    result.routeErrors.push(entry);
  };

  page.on('pageerror', (error) => {
    recordRouteError({
      type: 'pageerror',
      path: currentPath,
      message: String(error),
    });
  });

  page.on('console', async (message) => {
    if (!['error', 'warning'].includes(message.type())) return;
    const text = message.text();
    if (!text) return;
    recordRouteError({
      type: `console:${message.type()}`,
      path: currentPath,
      message: text,
    });
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('/api/')) return;
    const status = response.status();
    if (status < 400) return;
    recordRouteError({
      type: 'api',
      path: currentPath,
      status,
      url,
    });
  });

  try {
    let auth;
    try {
      auth = await login(credentials);
    } catch (error) {
      result.loginError = String(error);
      return result;
    }

    result.loginUrl = `${BASE_URL}${auth.startPath}`;
    const allowedPrefix = getRolePrefix(auth.startPath);
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate((payload) => {
      sessionStorage.clear();
      localStorage.clear();
      sessionStorage.setItem('accessToken', payload.accessToken);
      sessionStorage.setItem('refreshToken', payload.refreshToken);
      sessionStorage.setItem('user', JSON.stringify(payload.user));
    }, auth);
    await page.goto(`${BASE_URL}${auth.startPath}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForNetworkIdle({ idleTime: 1200, timeout: 30000 }).catch(() => null);

    const queue = [normalizeUrl(page.url()), auth.startPath]
      .filter(Boolean)
      .filter((candidate) => candidate === allowedPrefix || candidate.startsWith(`${allowedPrefix}/`));
    const visited = new Set();

    while (queue.length && visited.size < MAX_PAGES_PER_ROLE) {
      const nextPath = queue.shift();
      if (!nextPath || visited.has(nextPath)) continue;
      visited.add(nextPath);
      currentPath = nextPath;

      const pageResult = {
        path: nextPath,
        finalUrl: null,
        title: null,
        discoveredLinks: [],
      };

      try {
        await page.goto(`${BASE_URL}${nextPath}`, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
        await page.waitForNetworkIdle({ idleTime: 800, timeout: 8000 }).catch(() => null);
        await sleep(800);
        pageResult.finalUrl = page.url();
        pageResult.title = await page.title();
        const links = await collectInternalLinks(page);
        pageResult.discoveredLinks = links
          .map((href) => normalizeUrl(href))
          .filter(Boolean)
          .filter((candidate) => candidate === allowedPrefix || candidate.startsWith(`${allowedPrefix}/`));
        for (const link of pageResult.discoveredLinks) {
          if (!visited.has(link) && !queue.includes(link)) queue.push(link);
        }
      } catch (error) {
        pageResult.error = String(error);
        recordRouteError({
          type: 'navigation',
          path: nextPath,
          message: String(error),
        });
      }

      result.pages.push(pageResult);
    }
  } finally {
    await context.close();
  }

  return result;
}

async function main() {
  const executablePath =
    BROWSER_CANDIDATES.find((candidate) => {
      try {
        return require('fs').existsSync(candidate);
      } catch {
        return false;
      }
    }) || undefined;

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const results = [];
    for (const credentials of ROLES) {
      results.push(await crawlRole(browser, credentials));
      await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf8');
    }
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf8');
    console.log(`WROTE ${OUTPUT_PATH}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
