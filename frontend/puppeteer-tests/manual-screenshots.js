const fs = require('fs/promises');
const path = require('path');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.CRAWL_BASE_URL || 'http://localhost:4200';
const API_BASE_URL = process.env.CRAWL_API_BASE_URL || 'http://localhost:3000';
const OUTPUT_DIR =
  process.env.MANUAL_SCREENSHOT_OUTPUT ||
  path.resolve(__dirname, '..', '..', 'docs', 'user-manual-assets');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');
const REQUESTED_IDS = new Set(
  (process.env.MANUAL_SCREENSHOT_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
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

const ROLE_CREDENTIALS = {
  ADMIN: { role: 'ADMIN', email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  CRM: { role: 'CRM', email: 'compliance@statcosol.com', password: 'Statco@123' },
  CCO: { role: 'CCO', email: 'crm_india@statcosol.com', password: 'Statco@123' },
  CEO: { role: 'CEO', email: 'mkkallepalli@gmail.com', password: 'Statco@123' },
  AUDITOR: { role: 'AUDITOR', email: 'payroll_audit@statcosol.com', password: 'Statco@123' },
  CLIENT: { role: 'CLIENT', email: 'ashok@logiqems.com', password: 'Statco@123' },
  CLIENT_MASTER: {
    role: 'CLIENT',
    email: 'nikhil.r.chitnis@gmail.com',
    password: 'Logiq@123',
  },
  CONTRACTOR: { role: 'CONTRACTOR', email: 'contractor@gmail.com', password: 'Statco@123' },
  PAYROLL: { role: 'PAYROLL', email: 'kallepalli.madan@gmail.com', password: 'Statco@123' },
  PF_TEAM: { role: 'PF_TEAM', email: 'statcosolutions@gmail.com', password: 'Statco@123' },
  EMPLOYEE: {
    role: 'EMPLOYEE',
    email: 'majjiprudhvi@gmail.com',
    password: 'Logiq@123',
    companyCode: 'LMS',
    authType: 'ess',
  },
};

const CAPTURES = [
  { id: 'login', label: 'Login', role: null, path: '/login' },
  { id: 'ess-login', label: 'ESS Login', role: null, path: '/ess/login' },

  { id: 'admin-dashboard', label: 'Admin Dashboard', role: 'ADMIN', path: '/admin/dashboard' },
  { id: 'admin-users', label: 'Admin Users', role: 'ADMIN', path: '/admin/users' },
  { id: 'admin-clients', label: 'Admin Clients', role: 'ADMIN', path: '/admin/clients' },

  { id: 'ceo-dashboard', label: 'CEO Dashboard', role: 'CEO', path: '/ceo/dashboard' },
  { id: 'ceo-registers', label: 'CEO Registers', role: 'CEO', path: '/ceo/registers' },
  { id: 'ceo-reports', label: 'CEO Reports', role: 'CEO', path: '/ceo/reports' },

  { id: 'cco-dashboard', label: 'CCO Dashboard', role: 'CCO', path: '/cco/dashboard' },
  { id: 'cco-escalations', label: 'CCO Escalations', role: 'CCO', path: '/cco/escalations' },
  { id: 'cco-registers', label: 'CCO Registers', role: 'CCO', path: '/cco/registers' },

  { id: 'crm-dashboard', label: 'CRM Dashboard', role: 'CRM', path: '/crm/dashboard' },
  { id: 'crm-returns', label: 'CRM Returns', role: 'CRM', path: '/crm/returns' },
  { id: 'crm-clients', label: 'CRM Clients', role: 'CRM', path: '/crm/clients' },

  { id: 'client-dashboard', label: 'Client Dashboard', role: 'CLIENT_MASTER', path: '/client/dashboard' },
  { id: 'client-branches', label: 'Client Branches', role: 'CLIENT_MASTER', path: '/client/branches' },
  { id: 'client-employees', label: 'Client Employees', role: 'CLIENT_MASTER', path: '/client/employees' },

  { id: 'ess-dashboard', label: 'ESS Dashboard', role: 'EMPLOYEE', path: '/ess/dashboard' },
  { id: 'ess-payslips', label: 'ESS Payslips', role: 'EMPLOYEE', path: '/ess/payslips' },
  { id: 'ess-documents', label: 'ESS Documents', role: 'EMPLOYEE', path: '/ess/documents' },

  { id: 'auditor-dashboard', label: 'Auditor Dashboard', role: 'AUDITOR', path: '/auditor/dashboard' },
  { id: 'auditor-reports', label: 'Auditor Reports', role: 'AUDITOR', path: '/auditor/reports' },
  { id: 'auditor-audits', label: 'Auditor Audits', role: 'AUDITOR', path: '/auditor/audits' },

  { id: 'branch-dashboard', label: 'Branch Dashboard', role: 'CLIENT', path: '/branch/dashboard' },
  {
    id: 'branch-compliance',
    label: 'Branch Monthly Compliance',
    role: 'CLIENT',
    path: '/branch/compliance/monthly',
  },
  { id: 'branch-uploads', label: 'Branch Uploads', role: 'CLIENT', path: '/branch/uploads' },

  {
    id: 'contractor-dashboard',
    label: 'Contractor Dashboard',
    role: 'CONTRACTOR',
    path: '/contractor/dashboard',
  },
  { id: 'contractor-tasks', label: 'Contractor Tasks', role: 'CONTRACTOR', path: '/contractor/tasks' },
  { id: 'contractor-support', label: 'Contractor Support', role: 'CONTRACTOR', path: '/contractor/support' },

  { id: 'payroll-dashboard', label: 'Payroll Dashboard', role: 'PAYROLL', path: '/payroll/dashboard' },
  { id: 'payroll-clients', label: 'Payroll Clients', role: 'PAYROLL', path: '/payroll/clients' },
  { id: 'payroll-reports', label: 'Payroll Reports', role: 'PAYROLL', path: '/payroll/reports' },

  { id: 'pf-dashboard', label: 'PF Team Dashboard', role: 'PF_TEAM', path: '/pf-team/dashboard' },
  { id: 'pf-tickets', label: 'PF Team Tickets', role: 'PF_TEAM', path: '/pf-team/tickets' },
].filter((item) => REQUESTED_IDS.size === 0 || REQUESTED_IDS.has(item.id));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  if (credentials.authType === 'ess') {
    return loginEss(credentials);
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `login failed for ${credentials.role}: ${response.status} ${JSON.stringify(body)}`,
    );
  }

  const user = buildUser(body);
  return {
    accessToken: body?.accessToken ?? body?.access_token ?? '',
    refreshToken: body?.refreshToken ?? body?.refresh_token ?? '',
    user,
    startPath: getRoleStartPath(user),
  };
}

async function loginEss(credentials) {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/ess/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      companyCode: credentials.companyCode,
      email: credentials.email,
      password: credentials.password,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `ESS login failed for ${credentials.role}: ${response.status} ${JSON.stringify(body)}`,
    );
  }

  const user = {
    ...(body?.user || {}),
    roleCode: body?.user?.roleCode || 'EMPLOYEE',
  };

  return {
    accessToken: body?.accessToken ?? body?.access_token ?? '',
    refreshToken: body?.refreshToken ?? body?.refresh_token ?? '',
    user,
    startPath: '/ess',
  };
}

async function seedSession(page, auth) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate((payload) => {
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem('accessToken', payload.accessToken);
    sessionStorage.setItem('refreshToken', payload.refreshToken);
    sessionStorage.setItem('user', JSON.stringify(payload.user));
  }, auth);
}

async function captureLoginPage(browser, item) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1440, height: 1024 });
    await page.goto(`${BASE_URL}${item.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForNetworkIdle({ idleTime: 600, timeout: 10000 }).catch(() => null);
    await sleep(800);
    const outputPath = path.join(OUTPUT_DIR, `${item.id}.png`);
    await page.screenshot({ path: outputPath, fullPage: false });
    return {
      id: item.id,
      label: item.label,
      path: item.path,
      file: path.relative(OUTPUT_DIR, outputPath).replace(/\\/g, '/'),
      finalUrl: page.url(),
      status: 'ok',
    };
  } finally {
    await page.close();
  }
}

async function captureAuthenticatedPage(browser, item, authCache) {
  const credentials = ROLE_CREDENTIALS[item.role];
  if (!credentials) {
    throw new Error(`Missing credentials for role ${item.role}`);
  }

  const auth = authCache[item.role] || (authCache[item.role] = await login(credentials));
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  try {
    await page.setViewport({ width: 1440, height: 1024 });
    await seedSession(page, auth);
    await page.goto(`${BASE_URL}${item.path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForNetworkIdle({ idleTime: 1000, timeout: 15000 }).catch(() => null);
    await sleep(1200);
    const outputPath = path.join(OUTPUT_DIR, `${item.id}.png`);
    await page.screenshot({ path: outputPath, fullPage: false });
    return {
      id: item.id,
      role: item.role,
      label: item.label,
      path: item.path,
      file: path.relative(OUTPUT_DIR, outputPath).replace(/\\/g, '/'),
      finalUrl: page.url(),
      status: 'ok',
    };
  } finally {
    await context.close();
  }
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

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

  const authCache = {};
  const manifest = [];

  try {
    for (const item of CAPTURES) {
      try {
        const entry =
          item.role == null
            ? await captureLoginPage(browser, item)
            : await captureAuthenticatedPage(browser, item, authCache);
        manifest.push(entry);
        await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
        console.log(`CAPTURED ${item.id}`);
      } catch (error) {
        manifest.push({
          id: item.id,
          role: item.role ?? null,
          label: item.label,
          path: item.path,
          status: 'error',
          error: String(error),
        });
        await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
        console.error(`FAILED ${item.id}: ${error}`);
      }
    }
  } finally {
    await browser.close();
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`WROTE ${MANIFEST_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
