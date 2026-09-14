// Built-frontend smoke with synthetic responses only. No live API/network access.
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '../dist/statco-frontend/browser');
const output = path.resolve(__dirname, '../../tmp-art/module-browser-samples');
fs.mkdirSync(output, { recursive: true });
const roles = [
  ['admin', 'ADMIN'],
  ['crm', 'CRM'],
  ['auditor', 'AUDITOR'],
  ['cco', 'CCO'],
  ['ceo', 'CEO'],
  ['client', 'CLIENT'],
  ['branch', 'CLIENT'],
  ['contractor', 'CONTRACTOR'],
  ['payroll', 'PAYROLL'],
];
const task = {
  id: 'sample-task',
  title: 'Sample payroll review',
  description: 'Fictional test record',
  module: 'PAYROLL',
  status: 'OPEN',
  priority: 'HIGH',
  client_id: 'client-sample',
  branch_id: 'branch-sample',
  company_name: 'Sample Company',
  branch_name: 'Sample Branch',
  due_date: '2026-09-30',
  overdue: false,
  reference_id: null,
};
const result = {
  items: [task],
  pagination: { total: 1, page: 1 },
  limit: 50,
  asOf: '2026-09-14',
  generatedAt: '2026-09-14T00:00:00Z',
  summary: { active: 1, overdue: 0, soon: 0, returned: 0, closed: 0, all: 1 },
  companies: [{ id: 'client-sample', name: 'Sample Company' }],
  branches: [{ id: 'branch-sample', name: 'Sample Branch', clientId: 'client-sample' }],
  modules: ['PAYROLL'],
};
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(
    /^\/app\//,
    '',
  );
  let file = path.resolve(root, pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
    file = path.join(root, 'index.html');
  res.setHeader(
    'Content-Type',
    {
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
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
  ].find((f) => fs.existsSync(f));
  const browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox'],
  });
  const outcomes = [];
  try {
    for (const [portal, roleCode] of roles) {
      for (const width of [1440, 390]) {
        const page = await browser.newPage();
        await page.setViewport({ width, height: 950 });
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        const user = {
          id: 'user-sample',
          roleCode,
          name: 'Sample ' + roleCode,
          email: 'sample@example.invalid',
          clientId: 'client-sample',
          branchIds: portal === 'branch' ? ['branch-sample'] : [],
          userType: portal === 'branch' ? 'BRANCH' : 'MASTER',
          isMasterUser: portal !== 'branch',
          servicePackage: 'FULL_SERVICE',
          enabledModules: [],
        };
        await page.evaluateOnNewDocument((user) => {
          sessionStorage.setItem('user', JSON.stringify(user));
          sessionStorage.setItem('accessToken', 'synthetic-browser-fixture');
          sessionStorage.setItem('idle_last_activity', String(Date.now()));
        }, user);
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const u = new URL(req.url());
          if (u.pathname.includes('/api/')) {
            let body = [];
            if (u.pathname.endsWith('/tasks/workspace')) body = result;
            else if (u.pathname.includes('session-config')) body = { idleTimeoutMinutes: 15 };
            else if (
              u.pathname.endsWith('/me') ||
              u.pathname.endsWith('/auth/me') ||
              u.pathname.endsWith('/me/profile')
            )
              body = user;
            else if (u.pathname.includes('summary') || u.pathname.includes('counts'))
              body = { total: 0, unread: 0, unreadCount: 0 };
            return req.respond({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(body),
            });
          }
          if (req.url().startsWith(base) || req.url().startsWith('data:')) return req.continue();
          return req.abort();
        });
        try {
          await page.goto(base + '/app/' + portal + '/my-work', {
            waitUntil: 'networkidle0',
            timeout: 20000,
          });
          await page.waitForFunction(
            () =>
              document.querySelector('app-my-work')?.textContent.includes('Sample payroll review'),
            { timeout: 10000 },
          );
          assert.equal(new URL(page.url()).pathname, '/app/' + portal + '/my-work');
          assert.equal(await page.$eval('select[name=company]', (e) => e.options.length), 2);
          await page.select('select[name=company]', 'client-sample');
          await page.waitForFunction(() => location.search.includes('clientId=client-sample'));
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 2,
          );
          assert.equal(overflow, false, 'Horizontal page overflow');
          assert.deepEqual(errors, []);
          await page.screenshot({ path: path.join(output, portal + '-' + width + '.png') });
          outcomes.push({ portal, width, status: 'PASS', sampleTask: true, companyFilter: true });
        } catch (e) {
          outcomes.push({ portal, width, status: 'FAIL', error: e.message, runtimeErrors: errors });
        }
        console.log(
          portal,
          width,
          outcomes[outcomes.length - 1].status,
          outcomes[outcomes.length - 1].error || '',
        );
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(outcomes, null, 2));
  console.log(JSON.stringify(outcomes, null, 2));
  if (outcomes.some((r) => r.status !== 'PASS')) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
