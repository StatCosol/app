const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  const out = (name) => path.join(__dirname, name);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.setViewport({ width: 1280, height: 900 });

  const results = [];

  async function testPage(url, selectors) {
    const r = { url, checks: [] };
    try {
      const res = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: out(`${url.replace(/[:\/]/g,'_')}.png`) });
    } catch (e) {
      r.error = String(e);
      results.push(r);
      return;
    }

    for (const s of selectors) {
      const check = { selector: s, opened: false, options: 0, error: null };
      try {
        await page.waitForSelector(s, { timeout: 3000 });
        const el = await page.$(s);
        await el.click({ delay: 100 });
        await page.waitForTimeout(400);
        // try to capture option elements inside select or popover
        const options = await page.$$eval('select option, .cdk-overlay-container mat-option, .mat-select-panel mat-option, .dropdown-menu li, .dropdown-item', els => els.map(e => e.textContent && e.textContent.trim()).filter(Boolean));
        check.opened = options.length > 0;
        check.options = options.length;
        check.sample = options.slice(0,5);
      } catch (e) {
        check.error = String(e);
      }
      r.checks.push(check);
    }

    await page.screenshot({ path: out(`${url.replace(/[:\/]/g,'_')}_after.png`) });
    results.push(r);
  }

  // Ensure server is running at localhost:4200
  const base = 'http://localhost:4200';

  await testPage(base + '/admin/users', [
    'select#role-select', // common
    'select',
    'app-users select',
    '.user-role-select',
    '.mat-select-trigger',
  ]);

  await testPage(base + '/admin/assignments', [
    'select',
    '.assignment-select',
    '.mat-select-trigger',
  ]);

  await fs.promises.writeFile(out('results.json'), JSON.stringify(results, null, 2));
  console.log('results written to', out('results.json'));

  await browser.close();
})();
