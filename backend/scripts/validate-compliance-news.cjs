// Synthetic sources and a disposable schema only; no external fetch or mail.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { DataSource } = require('typeorm');
const { ClientCommsCronService } = require('../dist/src/client-contacts/client-comms-cron.service');
const connection = { host: '127.0.0.1', port: Number(process.env.AUTOMATION_TEST_PORT || 55439), user: process.env.AUTOMATION_TEST_USER || 'monthly_close_test', password: process.env.AUTOMATION_TEST_PASSWORD || undefined, database: process.env.AUTOMATION_TEST_DATABASE || 'postgres' };
(async () => {
  const schema = `news_regression_${Date.now()}`;
  assert.match(schema, /^news_regression_\d+$/);
  const admin = new Client(connection);
  await admin.connect();
  let ds;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    ds = new DataSource({ type: 'postgres', ...connection, username: connection.user, schema, extra: { options: `-c search_path=${schema},public` } });
    await ds.initialize();
    await ds.query(`CREATE TABLE roles(id uuid,code text);
      CREATE TABLE users(id uuid,role_id uuid,email text,deleted_at timestamptz,created_at timestamptz);
      CREATE TABLE news_items(title text,body text,category text,pinned boolean,is_active boolean,expires_at timestamptz,created_by uuid,created_at timestamptz,updated_at timestamptz,deleted_at timestamptz);
      INSERT INTO users VALUES('00000000-0000-4000-8000-000000000001',NULL,'admin@statcosol.com',NULL,NOW());`);
    for (const name of ['20260928_compliance_news_source_snapshots.sql', '20260928_seed_labour_fssai_news.sql', '20261011_news_source_change_identity.sql', '20261019_compliance_notification_content.sql']) {
      const sql = fs.readFileSync(path.join(__dirname, '../migrations', name), 'utf8');
      await ds.query(sql);
      const countBeforeRepeat = Number((await ds.query('SELECT count(*) FROM news_items'))[0].count);
      await ds.query(sql); // migrations are repeatable
      assert.equal(Number((await ds.query('SELECT count(*) FROM news_items'))[0].count), countBeforeRepeat);
    }
    await ds.query('DELETE FROM news_items');
    const service = Object.create(ClientCommsCronService.prototype);
    service.ds = ds;
    const source = { code: 'SYNTHETIC', label: 'Synthetic Source', url: 'https://example.invalid' };
    let version = 1;
    service.fetchSourceHtml = async () => `<a href="/notice-${version}.pdf">Minimum wage notification revision ${version} of 2026</a>`;
    service.log = { warn: () => {} };
    const publish = () => service.publishSourceIfChanged(source);
    const count = async () => Number((await ds.query('SELECT count(*) FROM news_items'))[0].count);
    await publish();
    assert.equal(await count(), 0, 'first scan is a baseline');
    const originalFetch = service.fetchSourceHtml;
    service.fetchSourceHtml = async () => '<p>Labour page visitor count changed</p>';
    await publish();
    assert.equal(await count(), 0, 'page-wide changes without notices do not publish');
    service.fetchSourceHtml = originalFetch;
    version = 2;
    await Promise.all([publish(), publish()]);
    assert.equal(await count(), 1, 'concurrent identical updates publish once');
    const [published] = await ds.query('SELECT title, body FROM news_items');
    assert.match(published.title, /Minimum wage notification revision 2/);
    assert.match(published.body, /Official notification: https:\/\/example.invalid\/notice-2.pdf/);
    assert.ok(!published.body.includes('An automated compliance monitor'));
    version = 1;
    await publish();
    assert.equal(await count(), 1, 'a baseline notice reappearing is not new');
    version = 3;
    await publish();
    assert.equal(await count(), 2, 'a later source revision publishes again');
    version = 2;
    await publish();
    assert.equal(await count(), 2, 'a previously published revision is not duplicated');
    version = 4;
    const before = (await ds.query('SELECT last_hash FROM compliance_news_source_snapshots'))[0].last_hash;
    await ds.query(`CREATE FUNCTION reject_news() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic publication failure'; END $$;
      CREATE TRIGGER reject_news BEFORE INSERT ON news_items FOR EACH ROW EXECUTE FUNCTION reject_news();`);
    await assert.rejects(publish(), /synthetic publication failure/);
    assert.equal((await ds.query('SELECT last_hash FROM compliance_news_source_snapshots'))[0].last_hash, before, 'failed publication must not advance the snapshot');
    await ds.query('DROP TRIGGER reject_news ON news_items');
    await publish();
    assert.equal(await count(), 3, 'failed publication is retried');
    await ds.query('UPDATE users SET deleted_at = NOW()');
    version = 5;
    await assert.rejects(publish(), /no admin user found/);
    await ds.query('UPDATE users SET deleted_at = NULL');
    await publish();
    assert.equal(await count(), 4, 'missing publishing user remains retryable');
    console.log('PASS: baseline, repeated changes, concurrency, revision deduplication, transaction rollback, publication retry, missing-admin retry, and repeatable migrations.');
  } finally {
    if (ds?.isInitialized) await ds.destroy();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
