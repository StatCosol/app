/* eslint-disable no-console */
type Json = any;

type HttpResult = { status: number; json?: Json; text?: string };

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const EMAIL = process.env.SMOKE_EMAIL ?? 'admin@statcosol.com';
const PASS = process.env.SMOKE_PASSWORD ?? 'Admin@123';

async function http(method: string, url: string, token?: string, body?: any): Promise<HttpResult> {
  const res = await (globalThis.fetch as any)(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const ct = (res.headers.get('content-type') ?? '').toLowerCase();
  if (ct.includes('application/json')) {
    return { status: res.status, json: await res.json() };
  }
  return { status: res.status, text: await res.text() };
}

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`SMOKE FAIL: ${msg}`);
}

async function main() {
  console.log(`SMOKE: base=${BASE}`);

  // 1) Health
  const health = await http('GET', `${BASE}/api/health`);
  assert(health.status === 200, `health status ${health.status}`);
  assert(health.json?.ok === true, 'health ok not true');
  console.log('OK: health');

  // 2) Login
  const login = await http('POST', `${BASE}/api/auth/login`, undefined, {
    email: EMAIL,
    password: PASS,
  });
  assert(login.status === 200, `login status ${login.status}`);
  const token = login.json?.access_token ?? login.json?.accessToken ?? login.json?.token;
  assert(token, 'token missing from login response');
  console.log('OK: login');

  // 3) Users listing (admin)
  const users = await http('GET', `${BASE}/api/admin/users`, token);
  assert(users.status === 200, `admin users status ${users.status}`);
  assert(Array.isArray(users.json), 'admin users response not array');
  console.log(`OK: admin users count=${users.json.length}`);

  // 4) Branches listing (admin)
  const branches = await http('GET', `${BASE}/api/admin/branches`, token);
  assert(branches.status === 200, `branches status ${branches.status}`);
  assert(Array.isArray(branches.json), 'branches response not array');
  console.log(`OK: branches count=${branches.json.length}`);

  // 5) Notifications inbox (admin)
  const inbox = await http('GET', `${BASE}/api/notifications/admin/all`, token);
  assert(inbox.status === 200, `notifications admin/all status ${inbox.status}`);
  assert(Array.isArray(inbox.json), 'notifications response not array');
  console.log(`OK: notifications threads=${inbox.json.length}`);

  console.log('✅ SMOKE PASS');
}

main().catch((e) => {
  console.error(String(e?.stack ?? e));
  process.exit(1);
});
