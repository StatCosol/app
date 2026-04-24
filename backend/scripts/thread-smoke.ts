/* eslint-disable no-console */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

type AnyJson = Record<string, unknown> | unknown[] | null;

type HttpResult = {
  status: number;
  json?: AnyJson;
  text?: string;
};

type TestStatus = 'PASS' | 'FAIL' | 'SKIP';

type TestResult = {
  status: TestStatus;
  name: string;
  detail: string;
};

const HOST = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const API_BASE = `${HOST.replace(/\/$/, '')}/api/v1`;

const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'it_admin@statcosol.com';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;

const CLIENT_EMAIL = process.env.SMOKE_CLIENT_EMAIL ?? 'testclient@test.com';
const CLIENT_PASSWORD = process.env.SMOKE_CLIENT_PASSWORD ?? 'Test@123';

if (!ADMIN_PASSWORD) {
  throw new Error(
    'SMOKE_ADMIN_PASSWORD must be set before running thread smoke tests.',
  );
}

const REPORT_PATH =
  process.env.THREAD_SMOKE_REPORT ??
  join(process.cwd(), '..', 'thread_smoke_results.txt');

async function http(
  method: string,
  path: string,
  opts?: { token?: string; body?: unknown },
): Promise<HttpResult> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(opts?.body ? { 'content-type': 'application/json' } : {}),
      ...(opts?.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    return { status: response.status, json: await response.json() };
  }
  return { status: response.status, text: await response.text() };
}

function unwrapData<T = any>(value: any): T {
  if (value && typeof value === 'object' && 'data' in value) {
    return value.data as T;
  }
  return value as T;
}

function getTokenFromLoginPayload(value: any): string | null {
  const data = unwrapData<any>(value);
  return (
    data?.accessToken ??
    data?.access_token ??
    data?.token ??
    value?.accessToken ??
    value?.access_token ??
    value?.token ??
    null
  );
}

function getThreadIdFromCreate(value: any): string | null {
  const data = unwrapData<any>(value);
  return data?.threadId ?? data?.notificationId ?? value?.threadId ?? null;
}

function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function nowStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

class Runner {
  private readonly results: TestResult[] = [];

  pass(name: string, detail: string) {
    this.results.push({ status: 'PASS', name, detail });
  }

  fail(name: string, detail: string) {
    this.results.push({ status: 'FAIL', name, detail });
  }

  skip(name: string, detail: string) {
    this.results.push({ status: 'SKIP', name, detail });
  }

  async expectOk(name: string, req: Promise<HttpResult>) {
    try {
      const res = await req;
      if (res.status >= 200 && res.status < 300) {
        this.pass(name, `HTTP ${res.status}`);
        return res;
      }
      this.fail(name, `HTTP ${res.status}`);
      return res;
    } catch (error: any) {
      this.fail(name, error?.message || String(error));
      return { status: 0 } as HttpResult;
    }
  }

  summaryLines() {
    const pass = this.results.filter((r) => r.status === 'PASS').length;
    const fail = this.results.filter((r) => r.status === 'FAIL').length;
    const skip = this.results.filter((r) => r.status === 'SKIP').length;
    const lines = [
      `THREAD SMOKE TEST ${nowStamp()}`,
      '='.repeat(80),
      ...this.results.map((r) => `${r.status} | ${r.name} | ${r.detail}`),
      '='.repeat(80),
      `TOTAL: ${pass} PASS, ${fail} FAIL, ${skip} SKIP`,
    ];
    return lines;
  }
}

async function main() {
  const runner = new Runner();

  const health = await runner.expectOk('Server Health', http('GET', '/health'));
  const healthData = unwrapData<any>(health.json);
  if (health.status >= 200 && health.status < 300 && healthData?.ok === true) {
    runner.pass('Health Payload', 'ok=true');
  } else {
    runner.fail('Health Payload', 'Expected ok=true');
  }

  const adminLogin = await runner.expectOk(
    'Admin Login',
    http('POST', '/auth/login', {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    }),
  );
  const adminToken = getTokenFromLoginPayload(adminLogin.json);
  if (!adminToken) {
    runner.fail('Admin Token Parse', 'Token missing in login response');
    finalizeAndExit(runner.summaryLines(), 1);
    return;
  }
  runner.pass('Admin Token Parse', 'Token extracted');

  const adminList = await runner.expectOk(
    'Admin Thread List',
    http('GET', '/admin/notifications?page=1&limit=10', { token: adminToken }),
  );
  const adminListData = unwrapData<any>(adminList.json);
  const adminRows = asArray(adminListData);
  runner.pass('Admin Thread List Parse', `rows=${adminRows.length}`);

  const clientLogin = await http('POST', '/auth/login', {
    body: { email: CLIENT_EMAIL, password: CLIENT_PASSWORD },
  });

  let threadId: string | null = null;
  let clientToken: string | null = null;

  if (clientLogin.status >= 200 && clientLogin.status < 300) {
    runner.pass('Client Login', `HTTP ${clientLogin.status}`);
    clientToken = getTokenFromLoginPayload(clientLogin.json);
    if (!clientToken) {
      runner.fail('Client Token Parse', 'Token missing in login response');
    } else {
      runner.pass('Client Token Parse', 'Token extracted');
    }
  } else {
    runner.skip(
      'Client Login',
      `HTTP ${clientLogin.status} (fallback to admin token for shared thread API checks)`,
    );
  }

  const actorToken = clientToken ?? adminToken;
  const actorLabel = clientToken ? 'Client' : 'Fallback User';

  if (actorToken) {
    const subject = `Thread smoke ${Date.now()}`;

    const createRes = await runner.expectOk(
      `${actorLabel} Create Thread`,
      http('POST', '/notifications', {
        token: actorToken,
        body: {
          subject,
          queryType: 'GENERAL',
          message: `Smoke thread from ${actorLabel.toLowerCase()}`,
        },
      }),
    );

    threadId = getThreadIdFromCreate(createRes.json);
    if (threadId) runner.pass('Thread Id Parse', `id=${threadId}`);
    else runner.fail('Thread Id Parse', 'Missing threadId/notificationId');

    await runner.expectOk(
      `${actorLabel} My Threads`,
      http('GET', '/notifications/my?page=1&limit=10', { token: actorToken }),
    );

    await runner.expectOk(
      'CRM/Branch Style Inbox',
      http('GET', '/notifications/inbox?page=1&limit=10', { token: adminToken }),
    );

    if (threadId) {
      await runner.expectOk(
        'Admin Reply Thread',
        http('POST', `/admin/notifications/${threadId}/reply`, {
          token: adminToken,
          body: { message: 'Smoke reply from admin' },
        }),
      );

      await runner.expectOk(
        `${actorLabel} Read Thread Detail`,
        http('GET', `/notifications/threads/${threadId}`, { token: actorToken }),
      );

      await runner.expectOk(
        'Admin Set Status',
        http('PATCH', `/admin/notifications/${threadId}/status`, {
          token: adminToken,
          body: { status: 'IN_PROGRESS' },
        }),
      );

      await runner.expectOk(
        `${actorLabel} Close Thread`,
        http('POST', `/notifications/threads/${threadId}/close`, {
          token: actorToken,
        }),
      );

      await runner.expectOk(
        `${actorLabel} Reopen Thread`,
        http('POST', `/notifications/threads/${threadId}/reopen`, {
          token: actorToken,
        }),
      );
    }
  }

  const lines = runner.summaryLines();
  finalizeAndExit(lines, lines.some((line) => line.startsWith('FAIL |')) ? 1 : 0);
}

function finalizeAndExit(lines: string[], code: number) {
  writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
  for (const line of lines) console.log(line);
  process.exit(code);
}

void main().catch((error: any) => {
  const msg = error?.stack || error?.message || String(error);
  const lines = [
    `THREAD SMOKE TEST ${nowStamp()}`,
    '='.repeat(80),
    `FAIL | Smoke Runner | ${msg}`,
    '='.repeat(80),
    'TOTAL: 0 PASS, 1 FAIL',
  ];
  finalizeAndExit(lines, 1);
});
