import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Controller(['health', 'api/health'])
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async health() {
    let dbOk = false;
    try {
      await this.dataSource.query('SELECT 1');
      dbOk = true;
    } catch { /* db unreachable */ }
    return { ok: dbOk, db: dbOk ? 'connected' : 'unreachable', ts: new Date().toISOString() };
  }
}
