const express = require('express');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  const dist = path.join(__dirname, '..', 'dist', 'statco-frontend');
  const app = express();
  const port = 4200;
  app.use(express.static(dist));
  app.use((req, res) => res.sendFile(path.join(dist, 'index.html')));

  const server = app.listen(port, async () => {
    console.log('Static server running on', port);
    try {
      const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
      const page = await browser.newPage();
      page.setViewport({ width: 1280, height: 900 });

      const out = (name) => path.join(__dirname, name.replace(/[\\/:]/g, '_'));
      const results = [];

      async function testPage(url, selectors) {
        const r = { url, checks: [] };
        try {
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          await page.waitForTimeout(800);
          await page.screenshot({ path: out(url + '.png') });
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
            const options = await page.$$eval('select option, .cdk-overlay-container mat-option, .mat-select-panel mat-option, .dropdown-menu li, .dropdown-item', els => els.map(e => e.textContent && e.textContent.trim()).filter(Boolean));
            check.opened = options.length > 0;
            check.options = options.length;
            check.sample = options.slice(0,5);
          } catch (e) {
            check.error = String(e);
          }
          r.checks.push(check);
        }

        await page.screenshot({ path: out(url + '_after.png') });
        results.push(r);
      }

      const base = 'http://localhost:4200';
      await testPage(base + '/admin/users', ['select#role-select', 'select', 'app-users select', '.user-role-select', '.mat-select-trigger']);
      await testPage(base + '/admin/assignments', ['select', '.assignment-select', '.mat-select-trigger']);

      await require('fs').promises.writeFile(out('results.json'), JSON.stringify(results, null, 2));
      console.log('results written');
      await browser.close();
    } catch (err) {
      console.error('Error during puppeteer run', err);
    } finally {
      server.close();
    }
  });
})();
