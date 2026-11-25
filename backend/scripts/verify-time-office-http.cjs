/*
 * Time Office end to end over HTTP: real Nest routing, global prefix/versioning,
 * the production guard chain (JWT -> roles -> scope -> service entitlements),
 * the global validation pipe and real SQL against the isolated test schema.
 * Called from verify-time-office-postgres.cjs after `npm run build`.
 */
const assert = require('node:assert/strict');
const { randomUUID: id } = require('node:crypto');
const { Module, VersioningType } = require('@nestjs/common');
const { NestFactory, APP_GUARD } = require('@nestjs/core');
const { JwtModule, JwtService } = require('@nestjs/jwt');
const { PassportModule } = require('@nestjs/passport');
const { ConfigService } = require('@nestjs/config');
const { DataSource } = require('typeorm');

const dist = (p) => require(`../dist/src/${p}`);
const { TimeOfficeController, TimeOfficeService } = dist('attendance/time-office');
const { TimeOfficeFollowupsService } = dist('attendance/time-office-followups');
const { JwtStrategy } = dist('auth/jwt.strategy');
const { JwtAuthGuard } = dist('auth/jwt-auth.guard');
const { RolesGuard } = dist('auth/roles.guard');
const { ScopeGuard } = dist('auth/guards/scope.guard');
const { ServiceEntitlementsGuard } = dist('service-entitlements/service-entitlements.guard');
const { ServiceEntitlementsService } = dist('service-entitlements/service-entitlements.service');
const { UsersService } = dist('users/users.service');
const { createGlobalValidationPipe } = dist('common/validators/global-validation-pipe');

const SECRET = 'time-office-http-test-only-secret';

module.exports = async ({ db, service, user, company, branch, otherCompany, otherBranch, sender, managerUser }) => {
  // Only the lookups the JWT strategy makes, answered from the test schema.
  const users = {
    findById: async (userId) => {
      const [u] = await db.query('SELECT id, client_id, employee_id, is_active, deleted_at FROM users WHERE id=$1', [userId]);
      return u && { id: u.id, clientId: u.client_id, employeeId: u.employee_id, isActive: u.is_active, deletedAt: u.deleted_at, sessionVersion: 0 };
    },
    getUserRoleCode: async (userId) =>
      (await db.query('SELECT r.code FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1', [userId]))[0]?.code,
    getUserBranchIds: async (userId) =>
      (await db.query('SELECT branch_id FROM user_branches WHERE user_id=$1', [userId])).map((r) => r.branch_id),
    getAssignedClientIds: async () => [],
    getPayrollAssignedClientIds: async () => [],
  };
  const config = { get: (k) => (k === 'JWT_SECRET' ? SECRET : undefined), getOrThrow: () => SECRET };

  class TimeOfficeHttpModule {}
  Module({
    imports: [PassportModule, JwtModule.register({ secret: SECRET })],
    controllers: [TimeOfficeController],
    providers: [
      TimeOfficeService,
      TimeOfficeFollowupsService,
      ServiceEntitlementsService,
      JwtStrategy,
      { provide: DataSource, useValue: db },
      { provide: UsersService, useValue: users },
      { provide: ConfigService, useValue: config },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_GUARD, useClass: ScopeGuard },
      { provide: APP_GUARD, useClass: ServiceEntitlementsGuard },
    ],
  })(TimeOfficeHttpModule);

  const app = await NestFactory.create(TimeOfficeHttpModule, { logger: false });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(createGlobalValidationPipe());
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api/v1/client/attendance/time-office`;
  const jwt = app.get(JwtService);
  const token = (sub, extra = {}) => jwt.sign({ sub, type: 'access', ...extra });
  const call = async (path, { auth = token(sender), method = 'GET', body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(auth ? { authorization: `Bearer ${auth}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  try {
    await db.query(`CREATE TABLE client_service_packages(client_id uuid PRIMARY KEY,package_code text,approved_at timestamptz);
      CREATE TABLE client_module_entitlements(client_id uuid,module_code text,is_enabled boolean DEFAULT true)`);

    // Authentication: no token, a refresh token and a bad signature never reach the data.
    assert.equal((await call('?date=2026-01-05', { auth: null })).status, 401);
    assert.equal((await call('?date=2026-01-05', { auth: token(sender, { type: 'refresh' }) })).status, 401);
    assert.equal((await call('?date=2026-01-05', { auth: new JwtService({ secret: 'other' }).sign({ sub: sender, type: 'access' }) })).status, 401);

    // Roles: a branch manager (CLIENT) cannot open the Time Office workspace.
    assert.equal((await call('?date=2026-01-05', { auth: token(managerUser) })).status, 403);

    // The response over HTTP is exactly what the service computes for this company.
    const direct = await service.dashboard(user, { date: '2026-01-05' });
    const http = await call('?date=2026-01-05');
    assert.equal(http.status, 200);
    assert(http.body.rows.length >= 5, 'expected the seeded workforce');
    assert.deepEqual(http.body, JSON.parse(JSON.stringify(direct)));
    assert(http.body.rows.every((r) => r.branch_id === branch || r.branch_id === null || r.worker_type === 'CONTRACTOR'));

    // Tenant isolation: a forged clientId in the token is ignored (company comes from the database)…
    const forged = await call('?date=2026-01-05', { auth: token(sender, { clientId: otherCompany, roleCode: 'ADMIN' }) });
    assert.equal(forged.status, 200);
    assert.deepEqual(forged.body, http.body);
    // …and asking for another company or its branch is refused.
    assert.equal((await call(`?date=2026-01-05&clientId=${otherCompany}`)).status, 403);
    assert.equal((await call(`?date=2026-01-05&branch=${otherBranch}`)).status, 403);

    // Filters are validated before any query.
    for (const q of ['?date=2099-01-01', '?hours=0', '?view=users', '?workforce=ALL&contractor=nope', '?page=0'])
      assert.equal((await call(q)).status, 400, q);
    assert.equal((await call('?date=2026-01-05&view=leaves')).body.total, 1);

    // Follow-up body validation and company scoping.
    const badBody = await call('/follow-up', { method: 'POST', body: { employeeId: 'x', date: '2026-01-05', target: 'CEO' } });
    assert.equal(badBody.status, 400);
    const [otherEmployee] = await db.query('SELECT id FROM employees WHERE client_id=$1 LIMIT 1', [otherCompany]);
    const crossTenant = await call('/follow-up', { method: 'POST', body: { employeeId: otherEmployee.id, date: '2026-01-05', target: 'EMPLOYEE' } });
    assert.equal(crossTenant.status, 403);
    assert.match(crossTenant.body.message, /not available in your company/);

    // Service entitlements: a company without Employee Attendance is blocked; an unapproved package grants nothing.
    await db.query(`INSERT INTO client_service_packages VALUES($1,'CONTRACTOR_AUDIT_ONLY',now())`, [company]);
    assert.equal((await call('?date=2026-01-05')).status, 403);
    await db.query(`UPDATE client_service_packages SET package_code='CUSTOM_SERVICES',approved_at=NULL WHERE client_id=$1`, [company]);
    await db.query(`INSERT INTO client_module_entitlements(client_id,module_code) VALUES($1,'EMPLOYEE_ATTENDANCE')`, [company]);
    assert.equal((await call('?date=2026-01-05')).status, 403);
    await db.query(`UPDATE client_service_packages SET approved_at=now() WHERE client_id=$1`, [company]);
    assert.equal((await call('?date=2026-01-05')).status, 200);

    // A deactivated or deleted Time Office login stops working immediately, even with a valid token.
    const live = token(sender);
    await db.query('UPDATE users SET is_active=false WHERE id=$1', [sender]);
    assert.equal((await call('?date=2026-01-05', { auth: live })).status, 401);
    await db.query('UPDATE users SET is_active=true, deleted_at=now() WHERE id=$1', [sender]);
    assert.equal((await call('?date=2026-01-05', { auth: live })).status, 401);
    await db.query('UPDATE users SET deleted_at=NULL WHERE id=$1', [sender]);

    // A Time Office user with no company is refused rather than shown everyone.
    const orphan = id();
    await db.query(`INSERT INTO users(id,client_id,role_id,name) SELECT $1,NULL,id,'No company' FROM roles WHERE code='TIME_OFFICE_EXECUTIVE'`, [orphan]);
    assert.equal((await call('?date=2026-01-05', { auth: token(orphan, { clientId: company }) })).status, 403);

    console.log('PASS: HTTP auth, role and token-type checks, forged-tenant and cross-company refusal, filter/body validation, service entitlements and deactivated-login handling.');
  } finally {
    await app.close();
  }
};
