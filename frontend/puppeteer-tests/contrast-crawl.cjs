/*
 * Contrast crawler: logs in as each portal role, visits every page reachable
 * from that portal's links, and reports visible text that fails WCAG AA
 * (4.5:1, or 3:1 for large text: >= 24px, or >= 18.66px bold).
 *
 * Text colour is blended over the nearest opaque ancestor background
 * (including semi-transparent layers). Text over a gradient or image is
 * reported separately as "unmeasured" rather than guessed.
 *
 * Usage:
 *   CONTRAST_ROLES='[{"role":"ADMIN","email":"a@x","password":"..."}]' \
 *   CRAWL_BASE_URL=http://localhost:4300 CRAWL_API_BASE_URL=http://localhost:3000 \
 *   node puppeteer-tests/contrast-crawl.cjs
 *
 * Output: CRAWL_OUTPUT (default contrast-crawl-results.json in this folder).
 */
const fs = require('fs/promises');
const path = require('path');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.CRAWL_BASE_URL || 'http://localhost:4200';
const API_BASE_URL = process.env.CRAWL_API_BASE_URL || 'http://localhost:3000';
const OUTPUT_PATH =
  process.env.CRAWL_OUTPUT || path.join(__dirname, 'contrast-crawl-results.json');
const MAX_PAGES_PER_ROLE = Number(process.env.CRAWL_MAX_PAGES || 60);
const SETTLE_MS = Number(process.env.CRAWL_SETTLE_MS || 1500);
const BROWSER_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const EXCLUDED_PATH_PATTERNS = [
  /\/login$/,
  /\/logout$/,
  /\/forgot-password$/,
  /\/uploads\//,
  /\/download(?:$|\/)/,
  /\/export(?:$|\/)/,
  /\.(pdf|xlsx?|zip|csv)(?:$|\?)/i,
];

function roles() {
  const raw = process.env.CONTRAST_ROLES;
  if (!raw) throw new Error('CONTRAST_ROLES (JSON array of {role,email,password}) is required');
  return JSON.parse(raw);
}

function normalizeUrl(value, prefix) {
  try {
    const url = new URL(value, BASE_URL);
    if (url.origin !== new URL(BASE_URL).origin) return null;
    const p = url.pathname.replace(/\/+$/, '') || '/';
    if (EXCLUDED_PATH_PATTERNS.some((re) => re.test(p))) return null;
    if (prefix && prefix !== '/' && !p.startsWith(prefix)) return null;
    return p;
  } catch {
    return null;
  }
}

// A role entry with companyCode logs in through the ESS endpoint.
async function apiLogin({ email, password, companyCode }) {
  const endpoint = companyCode ? 'auth/ess/login' : 'auth/login';
  const res = await fetch(`${API_BASE_URL}/api/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(companyCode ? { companyCode, email, password } : { email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`login ${email}: ${res.status} ${JSON.stringify(body)}`);
  return body;
}

/* Runs inside the page. Returns failing and unmeasured text elements. */
function measurePage() {
  const parse = (c) => {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, bottom) => {
    const a = top.a + bottom.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (k) => (top[k] * top.a + bottom[k] * bottom.a * (1 - top.a)) / a;
    return { r: mix('r'), g: mix('g'), b: mix('b'), a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (x, y) => {
    const a = lum(x);
    const b = lum(y);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const hex = ({ r, g, b }) =>
    '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  // Effective background(s): blend translucent layers down to the first opaque
  // one. A gradient yields one candidate per colour stop, so text is judged
  // against the stop it contrasts with least. A url() image cannot be judged.
  const backgrounds = (el) => {
    const layers = [];
    let node = el;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      const img = cs.backgroundImage;
      if (img && img !== 'none' && /url\(/.test(img)) {
        return { unmeasured: 'background image' };
      }
      if (img && /gradient/.test(img)) {
        const stops = (img.match(/rgba?\([^)]+\)/g) || []).map(parse).filter(Boolean);
        if (stops.length) {
          const below = backgrounds(node.parentElement || document.documentElement);
          if (below.unmeasured) return below;
          const out = [];
          for (const b of below.colors) {
            for (const s of stops) {
              let base = over(s, b);
              for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
              out.push(base);
            }
          }
          return { colors: out, gradient: true };
        }
      }
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) {
        layers.push(bg);
        if (bg.a >= 1) break;
      }
      node = node.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return { colors: [base] };
  };

  const effectiveOpacity = (el) => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  };

  const describe = (el) => {
    const parts = [];
    for (let n = el, i = 0; n && n.nodeType === 1 && i < 4; n = n.parentElement, i++) {
      let s = n.tagName.toLowerCase();
      if (n.id) s += '#' + n.id;
      const cls = (typeof n.className === 'string' ? n.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
      if (cls.length) s += '.' + cls.join('.');
      parts.unshift(s);
      if (n.tagName.includes('-')) break; // stop at the Angular component host
    }
    return parts.join(' > ');
  };

  const host = (el) => {
    for (let n = el; n; n = n.parentElement) if (n.tagName && n.tagName.includes('-') && !n.tagName.startsWith('UI-') && !n.tagName.startsWith('APP-ICON')) return n.tagName.toLowerCase();
    return null;
  };

  const failing = [];
  const unmeasured = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let t;
  while ((t = walker.nextNode())) {
    const text = t.textContent.replace(/\s+/g, ' ').trim();
    if (!text || !/[\p{L}\p{N}]/u.test(text)) continue;
    const el = t.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (el.closest('script,style,noscript,svg,[aria-hidden="true"],.sr-only,.cdk-visually-hidden')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.display === 'none') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    // Disabled controls are exempt from WCAG 1.4.3.
    if (el.closest('button:disabled,input:disabled,select:disabled,textarea:disabled,[aria-disabled="true"],fieldset:disabled')) continue;
    const fg = parse(cs.color);
    if (!fg) continue;
    const bgInfo = backgrounds(el);
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;
    const entry = {
      text: text.slice(0, 80),
      component: host(el),
      selector: describe(el),
      fontSize: size,
      fontWeight: cs.fontWeight,
    };
    if (bgInfo.unmeasured) {
      unmeasured.push({ ...entry, reason: bgInfo.unmeasured, color: cs.color });
      continue;
    }
    const opacity = effectiveOpacity(el);
    let worst = null;
    for (const bg of bgInfo.colors) {
      const fgEff = over({ ...fg, a: fg.a * opacity }, bg);
      const r = ratio(fgEff, bg);
      if (!worst || r < worst.r) worst = { r, fgEff, bg };
    }
    if (worst.r + 1e-6 < need) {
      failing.push({
        ...entry,
        color: hex(worst.fgEff),
        background: hex(worst.bg),
        ratio: Math.round(worst.r * 100) / 100,
        need,
        gradient: bgInfo.gradient || undefined,
        opacity: opacity < 1 ? opacity : undefined,
      });
    }
  }
  return { failing, unmeasured };
}

async function main() {
  const executablePath = await (async () => {
    for (const p of BROWSER_CANDIDATES) {
      try {
        await fs.access(p);
        return p;
      } catch {}
    }
    return undefined;
  })();
  const browser = await puppeteer.launch({ headless: true, executablePath, defaultViewport: { width: 1440, height: 900 } });
  const results = [];
  try {
    for (const cred of roles()) {
      let auth;
      try {
        auth = await apiLogin(cred);
      } catch (e) {
        results.push({ role: cred.role, loginError: String(e) });
        console.error(String(e));
        continue;
      }
      const accessToken = auth.accessToken || auth.access_token;
      const refreshToken = auth.refreshToken || auth.refresh_token || '';
      const user = auth.user || {};
      const page = await browser.newPage();
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.evaluate((p) => {
        localStorage.clear();
        sessionStorage.setItem('accessToken', p.accessToken);
        sessionStorage.setItem('refreshToken', p.refreshToken);
        sessionStorage.setItem('user', JSON.stringify(p.user));
      }, { accessToken, refreshToken, user });
      const start = cred.start || '/';
      await page.goto(`${BASE_URL}${start}`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      const landed = new URL(page.url()).pathname;
      const prefix = cred.prefix || '/' + (landed.split('/').filter(Boolean)[0] || '');
      const queue = [landed];
      const visited = new Set();
      while (queue.length && visited.size < MAX_PAGES_PER_ROLE) {
        const p = queue.shift();
        if (visited.has(p)) continue;
        visited.add(p);
        if (p !== new URL(page.url()).pathname) {
          await page.goto(`${BASE_URL}${p}`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
          await new Promise((r) => setTimeout(r, SETTLE_MS));
        }
        const finalPath = new URL(page.url()).pathname;
        if (finalPath.endsWith('/login')) {
          results.push({ role: cred.role, path: p, error: 'redirected to login' });
          continue;
        }
        const m = await page.evaluate(measurePage).catch((e) => ({ error: String(e) }));
        results.push({ role: cred.role, path: p, ...m });
        console.log(`${cred.role} ${p}: ${m.failing ? m.failing.length : m.error} failing`);
        const links = await page.$$eval('a[href]', (as) => as.map((a) => a.href)).catch(() => []);
        for (const l of links) {
          const n = normalizeUrl(l, prefix);
          if (n && !visited.has(n) && !queue.includes(n)) queue.push(n);
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  const pages = results.filter((r) => r.failing);
  const total = pages.reduce((s, r) => s + r.failing.length, 0);
  const summary = { pages: pages.length, failing: total, unmeasured: pages.reduce((s, r) => s + r.unmeasured.length, 0) };
  await fs.writeFile(OUTPUT_PATH, JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify(summary));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
