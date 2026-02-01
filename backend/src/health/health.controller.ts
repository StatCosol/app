import { Controller, Get } from '@nestjs/common';

@Controller(['health', 'api/health'])
export class HealthController {
  @Get()
  health() {
    return { ok: true, ts: new Date().toISOString() };
  }
}
