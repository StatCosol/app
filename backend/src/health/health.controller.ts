import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { Public } from '../auth/public.decorator';

@ApiTags('Health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Check API and database health' })
  @Get()
  async health() {
    let dbOk = false;
    try {
      await this.dataSource.query('SELECT 1');
      dbOk = true;
    } catch {
      /* db unreachable – logged by response */
    }
    return {
      ok: dbOk,
      db: dbOk ? 'connected' : 'unreachable',
      ts: new Date().toISOString(),
    };
  }
}
