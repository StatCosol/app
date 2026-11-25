import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Boot patches in main.ts run on every start of every replica, and every merge
 * to main restarts production. A patch that rewrites a setting an Admin can
 * change therefore silently undoes that Admin's choice on the next deploy.
 */
describe('main.ts boot patches', () => {
  const main = readFileSync(join(__dirname, 'main.ts'), 'utf8');

  it('does not re-enable CRM on-behalf for clients an Admin turned it off for', () => {
    expect(main).not.toMatch(/UPDATE\s+clients\s+SET\s+crm_on_behalf_enabled/i);
  });
});
