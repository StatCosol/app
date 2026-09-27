// PGlite-compatible adapter for the existing SQL fixtures. Never reads DB_HOST
// or any application connection settings. Each instance owns a disposable DB.
const { Client } = require('pg');
const { randomUUID } = require('node:crypto');
const config = {
  host: '127.0.0.1',
  port: Number(process.env.AUDITXPERT_TEST_PORT || 55439),
  user: process.env.AUDITXPERT_TEST_USER || 'monthly_close_test',
  password: process.env.AUDITXPERT_TEST_PASSWORD,
  database: 'postgres',
};
class PGlite {
  constructor() {
    this.name = `auditxpert_test_${randomUUID().replaceAll('-', '')}`;
    this.admin = new Client(config);
    this.ready = this.initialize();
  }
  async initialize() {
    await this.admin.connect();
    await this.admin.query(`CREATE DATABASE "${this.name}"`);
    this.client = new Client({ ...config, database: this.name });
    await this.client.connect();
  }
  async query(sql, parameters) { await this.ready; return this.client.query(sql, parameters); }
  async exec(sql) { return this.query(sql); }
  async transaction(callback) {
    await this.query('BEGIN');
    try {
      const result = await callback(this);
      await this.query('COMMIT'); return result;
    } catch (error) { await this.query('ROLLBACK'); throw error; }
  }
  async close() {
    try { await this.ready; } catch { /* Initialization may still have created the DB. */ }
    try { await this.client?.end(); }
    finally {
      try {
        if (!/^auditxpert_test_[0-9a-f]{32}$/.test(this.name)) throw new Error('Invalid disposable database name');
        await this.admin.query(`DROP DATABASE IF EXISTS "${this.name}"`);
      } finally { await this.admin.end(); }
    }
  }
}
module.exports = { PGlite };
