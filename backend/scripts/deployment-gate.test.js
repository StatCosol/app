const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const workflow = yaml.load(fs.readFileSync(path.join(__dirname, '../../.github/workflows/deploy-azure.yml'), 'utf8'));
const script = workflow.jobs.checks.steps[0].with.script;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function runGate(runs, ref = 'refs/heads/main') {
  const failures = [];
  const calls = [];
  const github = { rest: { actions: { listWorkflowRuns: async args => {
    calls.push(args);
    return { data: { workflow_runs: runs(args.workflow_id) } };
  } } } };
  await new AsyncFunction('github', 'core', 'context', 'setTimeout', script)(
    github, { setFailed: reason => failures.push(reason) },
    { ref, sha: 'current', repo: { owner: 'test', repo: 'test' } },
    callback => callback(),
  );
  return { failures, calls };
}
const success = { id: 1, head_sha: 'current', status: 'completed', conclusion: 'success' };

test('both checks must succeed for the exact deployment commit', async () => {
  const { failures, calls } = await runGate(() => [success]);
  assert.deepEqual(failures, []);
  assert.deepEqual(calls.map(c => c.workflow_id), ['ci.yml', 'security.yml']);
  assert.ok(calls.every(c => c.head_sha === 'current' && c.event === 'push' && c.branch === 'main'));
});
test('a failed security run blocks deployment', async () => {
  const result = await runGate(id => [{ ...success, conclusion: id === 'security.yml' ? 'failure' : 'success' }]);
  assert.match(result.failures[0], /security.yml failed/);
});
test('a passing older commit cannot authorize this deployment', async () => {
  const result = await runGate(() => [{ ...success, head_sha: 'other' }]);
  assert.match(result.failures[0], /Timed out/);
});
test('manual deployment from a feature branch is refused', async () => {
  const result = await runGate(() => [success], 'refs/heads/feature');
  assert.equal(result.calls.length, 0);
  assert.match(result.failures[0], /requires main/);
});

test('migration failure, cancellation and timeout block the backend update', () => {
  require('./validate-deploy-migration-order.cjs');
});
