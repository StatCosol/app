// Offline regression: execute the workflow shell bodies with a mocked Azure CLI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const workflow = yaml.load(fs.readFileSync(path.join(__dirname, '../../.github/workflows/deploy-azure.yml'), 'utf8'));
const steps = workflow.jobs['deploy-backend'].steps;
const migrationAt = steps.findIndex(s => s.name === 'Apply service entitlement migrations');
const deployAt = steps.findIndex(s => s.name === 'Deploy backend Container App');
assert(migrationAt >= 0 && deployAt > migrationAt, 'Migration must run before the backend update');
assert(!steps[migrationAt]['continue-on-error'], 'Migration failure must stop deployment');
assert(!steps[deployAt].if, 'Deployment must retain default success-only gating');
const shellBody = step => step.run.replace(/\$\{\{[^}]+\}\}/g, 'test');
const mock = `az() {
  case "$*" in
    "containerapp job execution show"*) echo "$TEST_MIGRATION_STATUS" ;;
    "containerapp job start"*) echo "test-execution" ;;
    "containerapp update"*) echo "BACKEND_DEPLOYED" ;;
    *) return 0 ;;
  esac
}
sleep() { :; }
`;
for (const status of ['Succeeded', 'Failed', 'Canceled', 'Running']) {
  const script = `${mock}\n(set -e\n${shellBody(steps[migrationAt])}\n) && (set -e\n${shellBody(steps[deployAt])}\n)`;
  const result = spawnSync(process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash', ['-c', script], { encoding: 'utf8', env: { ...process.env, TEST_MIGRATION_STATUS: status } });
  if (result.error) throw result.error;
  assert.equal(result.stdout.includes('BACKEND_DEPLOYED'), status === 'Succeeded', `${status}: unexpected deployment behavior`);
  assert.equal(result.status === 0, status === 'Succeeded', `${status}: wrong exit status`);
  console.log(`PASS ${status}: ${status === 'Succeeded' ? 'deploys after migration' : 'blocks deployment'}`);
}
