// Exercise the real RolesGuard against every compiled controller's declared policy.
// Does not validate JWTs, ownership guards, or whether each policy is correct.
require('reflect-metadata');
const fs = require('node:fs'),
  path = require('node:path');
const { Reflector } = require('@nestjs/core');
const { Logger } = require('@nestjs/common');
const { PATH_METADATA, METHOD_METADATA } = require('@nestjs/common/constants');
const { RolesGuard } = require('../dist/src/auth/roles.guard');
Logger.overrideLogger(false);
const guard = new RolesGuard(new Reflector());
const root = path.resolve(__dirname, '../..');
const files = (d) =>
  fs
    .readdirSync(d, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? files(path.join(d, e.name)) : [path.join(d, e.name)],
    );
const identities = [
  'ADMIN',
  'CEO',
  'CCO',
  'CRM',
  'AUDITOR',
  'CLIENT',
  'CONTRACTOR',
  'PAYROLL',
  'PAYDEK',
  'EMPLOYEE',
  'PF_TEAM',
  'ACCOUNTS',
  'SALES',
  'BRANCH_DESK',
  'UNKNOWN',
].map((roleCode) => ({ roleCode }));
identities.push({ roleCode: 'CLIENT', userType: 'BRANCH' }, undefined);
// Include newly introduced role names automatically, before checking any endpoint.
for (const file of files(path.join(root, 'backend/dist/src')).filter((f) =>
  f.endsWith('.controller.js'),
)) {
  if (
    !fs.existsSync(
      file
        .replace(
          path.join('backend', 'dist', 'src'),
          path.join('backend', 'src'),
        )
        .replace(/\.js$/, '.ts'),
    )
  )
    continue;
  for (const controller of Object.values(require(file))) {
    if (
      typeof controller !== 'function' ||
      Reflect.getMetadata(PATH_METADATA, controller) === undefined
    )
      continue;
    const declared = [...(Reflect.getMetadata('roles', controller) || [])];
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = controller.prototype[name];
      if (typeof handler === 'function')
        declared.push(...(Reflect.getMetadata('roles', handler) || []));
    }
    for (const roleCode of declared)
      if (!identities.some((user) => user?.roleCode === roleCode))
        identities.push({ roleCode });
  }
}
const results = [],
  uncovered = [],
  seen = new Set();
for (const file of files(path.join(root, 'backend/dist/src')).filter((f) =>
  f.endsWith('.controller.js'),
)) {
  // Ignore stale compiled files left behind after a source file was removed.
  if (
    !fs.existsSync(
      file
        .replace(
          path.join('backend', 'dist', 'src'),
          path.join('backend', 'src'),
        )
        .replace(/\.js$/, '.ts'),
    )
  )
    continue;
  for (const controller of Object.values(require(file))) {
    if (
      typeof controller !== 'function' ||
      seen.has(controller) ||
      Reflect.getMetadata(PATH_METADATA, controller) === undefined
    )
      continue;
    seen.add(controller);
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = controller.prototype[name];
      if (
        typeof handler !== 'function' ||
        Reflect.getMetadata(METHOD_METADATA, handler) === undefined
      )
        continue;
      const roles =
        Reflect.getMetadata('roles', handler) ??
        Reflect.getMetadata('roles', controller);
      const publicRoute =
        Reflect.getMetadata('isPublic', handler) ??
        Reflect.getMetadata('isPublic', controller);
      const endpoint = {
        controller: controller.name,
        handler: name,
        roles,
        public: !!publicRoute,
        file: path.relative(root, file).replaceAll('\\', '/'),
      };
      if (!roles?.length || publicRoute) {
        uncovered.push({
          ...endpoint,
          status: publicRoute ? 'PUBLIC_ROUTE' : 'NO_DECLARED_ROLE_POLICY',
        });
        continue;
      }
      for (const user of identities) {
        const effective = user
          ? [
              user.roleCode,
              ...(user.roleCode === 'CLIENT' && user.userType === 'BRANCH'
                ? ['BRANCH_DESK']
                : []),
              ...(user.roleCode === 'PAYROLL' ? ['PAYDEK'] : []),
            ]
          : [];
        const expected = roles.some((r) => effective.includes(r));
        let actual, exception;
        try {
          actual = guard.canActivate({
            getHandler: () => handler,
            getClass: () => controller,
            switchToHttp: () => ({ getRequest: () => ({ user }) }),
          });
        } catch (e) {
          actual = false;
          exception = e.getStatus?.();
        }
        const status =
          actual === expected && (actual || exception === 403)
            ? 'PASS'
            : 'FAIL';
        results.push({
          ...endpoint,
          identity: user || 'anonymous',
          expected: expected ? 'ALLOW' : 'DENY',
          status,
        });
      }
    }
  }
}
const output = path.join(root, 'tmp-art/option-audit');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(
  path.join(output, 'endpoint-role-results.json'),
  JSON.stringify(
    {
      scope:
        'Declared role guard behavior only; JWT, ownership and business actions remain separate.',
      results,
      uncovered,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    controllers: seen.size,
    endpointsWithRoles: results.length / identities.length,
    roleCases: results.length,
    failed: results.filter((r) => r.status === 'FAIL').length,
    publicOrNoRolePolicy: uncovered.length,
  }),
);
if (results.some((r) => r.status === 'FAIL')) process.exitCode = 1;
