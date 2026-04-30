import { Injectable } from '@nestjs/common';

@Injectable()
export class AutomationService {
  health() {
    return {
      ok: true,
      module: 'automation',
      message: 'Automation engine active',
      ts: new Date().toISOString(),
    };
  }
}
