import { ScheduledJobInventoryController } from './scheduled-job-inventory.controller';
import { MetadataScanner, Reflector } from '@nestjs/core';
import { Cron } from '@nestjs/schedule';
import { ROLES_KEY } from '../auth/roles.decorator';

describe('Registered automation inventory', () => {
  it('discovers schedules without executing jobs', () => {
    class ExampleJobs {
      @Cron('0 0 9 * * *', { timeZone: 'Asia/Kolkata' })
      daily() {
        throw new Error('must not execute');
      }
      @Cron('0 0 1 * * *', { disabled: true })
      maintenance() {
        throw new Error('must not execute');
      }
    }
    const discovery = {
      getProviders: () => [
        {
          instance: new ExampleJobs(),
          metatype: ExampleJobs,
          isDependencyTreeStatic: () => true,
        },
      ],
    };
    const controller = new ScheduledJobInventoryController(
      discovery as any,
      new MetadataScanner(),
      new Reflector(),
    );
    const result = controller.list();
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs[0]).toMatchObject({
      operation: 'daily',
      timeZone: 'Asia/Kolkata',
      enabled: true,
      managedHere: false,
    });
    expect(result.jobs[1]).toMatchObject({
      operation: 'maintenance',
      enabled: false,
      timeZone: expect.stringContaining('Server default'),
    });
    expect(result.note).toContain('does not prove successful execution');
    expect(
      Reflect.getMetadata(ROLES_KEY, ScheduledJobInventoryController),
    ).toEqual(['ADMIN']);
  });
});
