// Exercise every concrete page with API failure responses in an isolated browser.
// This verifies navigation/error resilience, not successful business transactions.
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '../..');
const build = path.join(root, 'frontend/dist/statco-frontend/browser');
const output = path.join(root, 'tmp-art/option-audit');
const inventory = JSON.parse(fs.readFileSync(path.join(output, 'inventory.json'), 'utf8'));
const roles = {
  admin: 'ADMIN',
  crm: 'CRM',
  auditor: 'AUDITOR',
  cco: 'CCO',
  ceo: 'CEO',
  client: 'CLIENT',
  branch: 'CLIENT',
  contractor: 'CONTRACTOR',
  payroll: 'PAYROLL',
  'pf-team': 'PF_TEAM',
  accounts: 'ACCOUNTS',
  sales: 'SALES',
  ess: 'EMPLOYEE',
};
const mode = process.env.OPTION_AUDIT_MODE || 'failure';
const recheck =
  mode === 'guard-fixtures'
    ? new Set(
        JSON.parse(fs.readFileSync(path.join(output, 'page-error-results.json'), 'utf8'))
          .filter((r) => r.status === 'REDIRECT_REVIEW')
          .map((r) => r.route),
      )
    : null;
const resultFile = mode === 'failure' ? 'page-error-results.json' : mode + '-results.json';
const rows = inventory.routes.filter(
  (r) =>
    r.component &&
    r.redirectTo === undefined &&
    !r.wildcard &&
    r.path.split('/').length > 2 &&
    r.guards.length &&
    (!recheck || recheck.has(r.path)),
);
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(
    /^\/app\//,
    '',
  );
  let file = path.resolve(build, pathname);
  if (!file.startsWith(build + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
    file = path.join(build, 'index.html');
  res.setHeader(
    'Content-Type',
    {
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.svg': 'image/svg+xml',
      '.woff2': 'font/woff2',
    }[path.extname(file)] || 'application/octet-stream',
  );
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const executablePath = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(fs.existsSync);
  const browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox'],
  });
  const results = [];
  try {
    let next = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < rows.length) {
          const row = rows[next++],
            portal = row.path.split('/')[1];
          const route = row.path.replace(/:[^/]+/g, '00000000-0000-4000-8000-000000000001');
          const page = await browser.newPage(),
            errors = [],
            requests = [];
          const isBranch = portal === 'branch' || row.path === '/client/compliance/mcd/uploads';
          const user = {
            id: '00000000-0000-4000-8000-000000000002',
            roleCode:
              mode === 'wrong-role'
                ? portal === 'ess'
                  ? 'CONTRACTOR'
                  : 'EMPLOYEE'
                : roles[portal],
            name: 'Fictional test user',
            email: 'test@example.invalid',
            clientId: '00000000-0000-4000-8000-000000000003',
            branchIds: isBranch ? ['00000000-0000-4000-8000-000000000004'] : [],
            userType: isBranch ? 'BRANCH' : 'MASTER',
            isMasterUser: !isBranch,
            servicePackage: 'FULL_SERVICE',
            enabledModules: [],
          };
          await page.setViewport({ width: 1440, height: 950 });
          if (mode !== 'anonymous')
            await page.evaluateOnNewDocument((user) => {
              sessionStorage.setItem('user', JSON.stringify(user));
              sessionStorage.setItem('accessToken', 'synthetic-browser-fixture');
              sessionStorage.setItem('idle_last_activity', String(Date.now()));
            }, user);
          page.on('pageerror', (e) => errors.push(e.message));
          await page.setRequestInterception(true);
          page.on('request', (req) => {
            const url = new URL(req.url());
            if (url.pathname.includes('/api/')) {
              requests.push({ method: req.method(), path: url.pathname });
              let body = { statusCode: 503, message: 'Synthetic service unavailable' },
                status = 503;
              if (/\/(me|me\/profile)$/.test(url.pathname)) {
                body = user;
                status = 200;
              }
              if (url.pathname.includes('session-config')) {
                body = { idleTimeoutMinutes: 15 };
                status = 200;
              }
              if (
                mode === 'guard-fixtures' &&
                /\/(crm\/clients\/assigned|payroll\/clients)$/.test(url.pathname)
              ) {
                body = [
                  { id: '00000000-0000-4000-8000-000000000001', clientName: 'Fictional company' },
                ];
                status = 200;
              }
              if (mode === 'guard-fixtures' && url.pathname.endsWith('/client/payroll/settings')) {
                body = {
                  allowBranchPayrollAccess: true,
                  allowBranchWageRegisters: true,
                  allowBranchSalaryRegisters: true,
                  payrollBranchScope: 'ALL',
                  payrollAllowedBranchIds: [],
                };
                status = 200;
              }
              return req.respond({
                status,
                contentType: 'application/json',
                body: JSON.stringify(body),
              });
            }
            if (req.url().startsWith(base) || req.url().startsWith('data:')) return req.continue();
            return req.abort();
          });
          const result = {
            route: row.path,
            scenario: mode,
            role: roles[portal],
            status: 'PASS',
            requests,
            errors,
          };
          try {
            await page.goto(base + '/app' + route, { waitUntil: 'networkidle0', timeout: 30000 });
            result.actualPath = new URL(page.url()).pathname;
            result.controls = await page.$$eval('button,input,select,textarea,a[href]', (els) =>
              els.map((e) => ({
                tag: e.tagName,
                label: (
                  e.innerText ||
                  e.getAttribute('aria-label') ||
                  e.getAttribute('placeholder') ||
                  e.getAttribute('name') ||
                  ''
                )
                  .trim()
                  .slice(0, 100),
                disabled: !!e.disabled,
              })),
            );
            result.textLength = await page.$eval('app-root', (e) => e.innerText.trim().length);
            if (mode === 'anonymous') {
              if (!result.actualPath.endsWith('/login')) result.status = 'FAIL';
            } else if (mode === 'wrong-role') {
              if (result.actualPath.replace(/\/$/, '') === ('/app' + route).replace(/\/$/, ''))
                result.status = 'FAIL';
            } else if (result.actualPath.replace(/\/$/, '') !== ('/app' + route).replace(/\/$/, ''))
              result.status = 'REDIRECT_REVIEW';
            if (errors.length || result.textLength < 20) result.status = 'FAIL';
          } catch (e) {
            result.status = 'FAIL';
            result.error = e.message;
          }
          results.push(result);
          console.log(
            results.length + '/' + rows.length,
            result.status,
            row.path,
            errors.join('; '),
          );
          await page.close();
          fs.writeFileSync(path.join(output, resultFile), JSON.stringify(results, null, 2));
        }
      }),
    );
  } finally {
    await browser.close();
    server.close();
  }
  console.log(
    JSON.stringify({
      total: results.length,
      counts: results.reduce((a, r) => {
        a[r.status] = (a[r.status] || 0) + 1;
        return a;
      }, {}),
    }),
  );
  if (results.some((r) => r.status === 'FAIL')) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
