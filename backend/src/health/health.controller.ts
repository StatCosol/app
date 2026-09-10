import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../auth/public.decorator';

@ApiTags('Health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Liveness: is the process up?
   *
   * Answers 200 even when the database is unreachable, and deliberately so —
   * the Dockerfile HEALTHCHECK polls this, and a failing status here restarts
   * the container. Restarting an application because Postgres blipped turns a
   * database outage into a crash loop that cannot fix itself. The body still
   * reports the database, so a human or a dashboard reading it sees the truth.
   */
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Check API and database health' })
  @Get()
  async health() {
    const dbOk = await this.checkDb();
    return {
      ok: dbOk,
      db: dbOk ? 'connected' : 'unreachable',
      ts: new Date().toISOString(),
    };
  }

  /**
   * Readiness: should this instance receive traffic?
   *
   * Separate from liveness because they answer different questions and want
   * opposite behaviour on a database outage: liveness must stay up so the
   * instance can recover, readiness must fail so the load balancer stops
   * sending requests that can only 500.
   *
   * Until this existed, a status-based probe on /health got 200 with
   * `{"ok": false}` in the body and kept a database-disconnected instance in
   * rotation — the failure was reported in a place nothing was reading.
   */
  @Public()
  @SkipThrottle()
  @ApiOperation({
    summary: 'Readiness — fails when a required dependency is down',
  })
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const dbOk = await this.checkDb();
    if (!dbOk) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      ok: dbOk,
      db: dbOk ? 'connected' : 'unreachable',
      ts: new Date().toISOString(),
    };
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
