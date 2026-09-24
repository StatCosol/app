import { Controller, Get, UseGuards } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller({ path: 'automation/control-center/inventory', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ScheduledJobInventoryController {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}
  @Get()
  list() {
    const jobs = new Map<
      string,
      {
        id: string;
        service: string;
        operation: string;
        schedule: string;
        timeZone: string;
        enabled: boolean;
        managedHere: boolean;
      }
    >();
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance;
      if (!instance || !wrapper.isDependencyTreeStatic()) continue;
      const proto = Object.getPrototypeOf(instance);
      if (!proto) continue;
      for (const method of this.scanner.getAllMethodNames(proto)) {
        const options = this.reflector.get<{
          cronTime: string;
          timeZone?: string;
          disabled?: boolean;
        }>(SCHEDULE_CRON_OPTIONS, instance[method]);
        if (!options) continue;
        const service = wrapper.metatype?.name || instance.constructor.name;
        const id = service + '.' + method;
        jobs.set(id, {
          id,
          service,
          operation: method,
          schedule: String(options.cronTime),
          timeZone:
            options.timeZone ||
            `Server default (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
          enabled: !options.disabled,
          managedHere: service === 'AutomationControlService',
        });
      }
    }
    return {
      jobs: [...jobs.values()].sort((a, b) => a.id.localeCompare(b.id)),
      note: 'Registered schedules only. This inventory does not prove successful execution. The rules below control the central dispatcher; other jobs keep their existing controls.',
    };
  }
}
