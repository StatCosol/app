/**
 * Smoke test: login → dashboard navigation for key roles.
 *
 * Usage:
 *   node smoke-test.js                         # against local dev (localhost:4200 / localhost:3000)
 *   SMOKE_BASE=https://app.statcosol.com \
 *   SMOKE_API=https://statcompy-backend.victoriouswave-37ad896d.centralindia.azurecontainerapps.io \
 *   node smoke-test.js                          # against production
 */

const puppeteer = require('puppeteer');
const path = require('path');

const BASE = process.env.SMOKE_BASE || 'http://localhost:4200';
const API  = process.env.SMOKE_API  || 'http://localhost:3000';

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
  {
    role: 'ADMIN',
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    landingPath: '/admin',
    checkSelectors: ['ui-page-header', '.card'],
  },
  {
    role: 'CEO',
    email: 'madan@statcosol.com',
    password: 'Statco@123',
    landingPath: '/ceo',
    checkSelectors: ['ui-page-header', '.card'],
  },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function findBrowser() {
  const fs = require('fs');
  for (const p of BROWSER_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return undefined; // fall back to bundled Chromium
}

(async () => {
  const executablePath = await findBrowser();
  const launchOpts = { headless: true, args: ['--no-sandbox', '--disable-gpu'] };
  if (executablePath) launchOpts.executablePath = executablePath;

  const browser = await puppeteer.launch(launchOpts);
  const results = [];
  let exitCode = 0;

  for (const { role, email, password, landingPath, checkSelectors } of ROLES) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    const result = { role, passed: false, steps: [] };

    try {
      // ── Step 1: Navigate to login page ──────────────────────────────────
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 20000 });
      result.steps.push({ step: 'navigate_login', ok: true });

      // ── Step 2: Fill credentials and submit ─────────────────────────────
      await page.waitForSelector('input[type="email"], input[name="email"], input#email', { timeout: 8000 });
      const emailInput = await page.$('input[type="email"]') || await page.$('input[name="email"]') || await page.$('input#email');
      const passInput  = await page.$('input[type="password"]');

      if (!emailInput || !passInput) throw new Error('Login form inputs not found');

      await emailInput.click({ clickCount: 3 });
      await emailInput.type(email, { delay: 30 });
      await passInput.click({ clickCount: 3 });
      await passInput.type(password, { delay: 30 });

      const submitBtn = await page.$('button[type="submit"]') || await page.$('form button');
      if (!submitBtn) throw new Error('Submit button not found');
      await submitBtn.click();
      result.steps.push({ step: 'fill_login', ok: true });

      // ── Step 3: Wait for navigation to dashboard ────────────────────────
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      await sleep(2000);

      const currentUrl = page.url();
      const urlOk = currentUrl.includes(landingPath);
      result.steps.push({ step: 'dashboard_redirect', ok: urlOk, url: currentUrl });
      if (!urlOk) throw new Error(`Expected ${landingPath} in URL, got ${currentUrl}`);

      // ── Step 4: Check key selectors render ──────────────────────────────
      for (const sel of checkSelectors) {
        const el = await page.$(sel);
        result.steps.push({ step: `selector_${sel}`, ok: !!el });
        if (!el) throw new Error(`Selector ${sel} not found on ${role} dashboard`);
      }

      // ── Step 5: Screenshot for evidence ─────────────────────────────────
      const ssPath = path.join(__dirname, `smoke_${role.toLowerCase()}.png`);
      await page.screenshot({ path: ssPath, fullPage: true });
      result.steps.push({ step: 'screenshot', ok: true, path: ssPath });

      result.passed = true;
    } catch (err) {
      result.error = String(err);
      exitCode = 1;
    } finally {
      await ctx.close();
    }

    results.push(result);
    const icon = result.passed ? '✓' : '✗';
    console.log(`${icon}  ${role}: ${result.passed ? 'PASS' : `FAIL – ${result.error}`}`);
  }

  await browser.close();

  // Write results JSON
  const fs = require('fs/promises');
  await fs.writeFile(
    path.join(__dirname, 'smoke-results.json'),
    JSON.stringify(results, null, 2),
  );

  console.log(`\nSmoke test complete: ${results.filter((r) => r.passed).length}/${results.length} passed`);
  process.exit(exitCode);
})();
