const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function check(mutate = (_, text) => text) {
  const processStub = { exitCode: 0 };
  const output = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'deep-module-check.js'), 'utf8'), {
    __dirname, process: processStub, console: { log: text => output.push(text) },
    require: name => name === 'fs' ? {
      ...fs,
      readFileSync: (p, encoding) => mutate(String(p).replaceAll('\\', '/'), fs.readFileSync(p, encoding)),
    } : require(name),
  });
  return { code: processStub.exitCode, output: output.join('\n') };
}

test('real module graph passes without DTO/name false positives', () => {
  assert.equal(check().code, 0);
});
test('missing provider fails the check', () => {
  const result = check((p, s) => p.endsWith('/files/files.module.ts') ? s.replace('providers: [FilesService]', 'providers: []') : s);
  assert.equal(result.code, 1);
  assert.match(result.output, /FilesService ->/);
});
test('disconnected feature module fails the check', () => {
  const result = check((p, s) => p.endsWith('/app.module.ts') ? s.replace(/\n\s+SalesModule,/, '\n') : s);
  assert.equal(result.code, 1);
  assert.match(result.output, /SalesModule/);
});
test('nonexistent delegation target fails the check', () => {
  const result = check((p, s) => p.endsWith('/payroll-input.service.ts') ? s.replace('async clientCreatePayrollInput(', 'async removedMethod(') : s);
  assert.equal(result.code, 1);
  assert.match(result.output, /MISSING clientCreatePayrollInput/);
});
