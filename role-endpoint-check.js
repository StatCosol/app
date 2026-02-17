const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 10000);
const ENDPOINTS = {
  CRM: process.env.CRM_ENDPOINT || '/api/crm/dashboard/summary',
  CCO: process.env.CCO_ENDPOINT || '/api/cco/dashboard',
  CEO: process.env.CEO_ENDPOINT || '/api/ceo/dashboard/summary',
  AUDITOR: process.env.AUDITOR_ENDPOINT || '/api/auditor/dashboard/summary',
  CLIENT: process.env.CLIENT_ENDPOINT || '/api/client/dashboard',
  CONTRACTOR: process.env.CONTRACTOR_ENDPOINT || '/api/contractor/dashboard',
};

function getCredentials(role) {
  const email = process.env[`${role}_EMAIL`];
  const password = process.env[`${role}_PASSWORD`];
  if (!email || !password) {
    throw new Error(`Missing credentials for ${role}. Set ${role}_EMAIL and ${role}_PASSWORD.`);
  }
  return { email, password };
}

function req(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    const r = http.request(url, opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          body = body ? JSON.parse(body) : {};
        } catch (_) {}
        resolve({ status: res.statusCode, body });
      });
    });
    r.setTimeout(TIMEOUT_MS, () => {
      r.destroy(new Error(`Request timed out after ${TIMEOUT_MS}ms`));
    });
    r.on('error', reject);
    if (data) r.write(JSON.stringify(data));
    r.end();
  });
}

async function login(email, password) {
  const res = await req('POST', '/api/auth/login', { email, password });
  if ((res.status === 200 || res.status === 201) && res.body.accessToken) {
    return { token: res.body.accessToken, role: res.body.user?.roleCode || res.body.user?.role?.code };
  }
  throw new Error(`Login failed (${res.status}): ${JSON.stringify(res.body)}`);
}

(async () => {
  for (const [label, endpoint] of Object.entries(ENDPOINTS)) {
    try {
      const { email, password } = getCredentials(label);
      const { token, role } = await login(email, password);
      const res = await req('GET', endpoint, null, token);
      const pass = res.status === 200;
      console.log(`${label.padEnd(11)} -> ${res.status} role=${role || 'n/a'}`);
      if (!pass) console.log('  body:', JSON.stringify(res.body));
    } catch (err) {
      console.log(`${label.padEnd(11)} -> ERROR ${err.message}`);
    }
  }
})();
