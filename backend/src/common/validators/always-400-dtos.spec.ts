import 'reflect-metadata';
import { createGlobalValidationPipe } from './global-validation-pipe';
import { ApplyHolidaysDto } from '../../attendance/holiday-calendar.dto';
import {
  CreateClraWagePeriodDto,
  CreateMyClraWorkerDto,
  UpdateClraAssignmentDto,
  UpsertClraWageDto,
} from '../../contractor/clra-assignments.dto';
import { CreateRuleDto } from '../../admin/dto/admin-applicability-config.dto';

/**
 * Bodies the global pipe rejected on every request because fields had no
 * decorator (forbidNonWhitelisted). Each case is the payload the screen sends,
 * through the pipe exactly as main.ts builds it.
 */
describe('bodies that used to be rejected every time', () => {
  const pipe = createGlobalValidationPipe();
  const run = (metatype: unknown, body: unknown) =>
    pipe.transform(JSON.parse(JSON.stringify(body)), {
      type: 'body',
      metatype: metatype as never,
      data: '',
    });
  const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  it('applies holidays for a month (client-holiday-calendar applyMonthNow)', async () => {
    const out = await run(ApplyHolidaysDto, { year: 2026, month: 9 });
    expect(out).toEqual(expect.objectContaining({ year: 2026, month: 9 }));
    await expect(
      run(ApplyHolidaysDto, { year: 2026, month: 13 }),
    ).rejects.toThrow();
  });

  it('creates a CLRA wage period', async () => {
    const out = await run(CreateClraWagePeriodDto, {
      assignmentId: uuid,
      periodFrom: '2026-09-01',
      periodTo: '2026-09-30',
      wageMonth: 9,
      wageYear: 2026,
    });
    expect(out.wageMonth).toBe(9);
  });

  it('saves a CLRA wage row', async () => {
    const out = await run(UpsertClraWageDto, {
      wagePeriodId: uuid,
      workerDeploymentId: uuid,
      daysWorked: 26,
      basicWage: 15000,
      grossWages: 16500,
      netWages: 15100,
      hra: 1500,
      pfDeduction: 1400,
    });
    expect(out.netWages).toBe(15100);
    await expect(
      run(UpsertClraWageDto, {
        wagePeriodId: uuid,
        workerDeploymentId: uuid,
        daysWorked: -1,
        basicWage: 1,
        grossWages: 1,
        netWages: 1,
      }),
    ).rejects.toThrow();
  });

  it('creates an applicability rule with conditions', async () => {
    const out = await run(CreateRuleDto, {
      name: 'Factories > 10',
      priority: 1,
      targetComplianceId: uuid,
      effect: 'APPLY',
      conditionsJson: { headcount: { gt: 10 } },
    });
    expect(out.conditionsJson).toEqual({ headcount: { gt: 10 } });
  });

  it('no longer lets a portal worker create carry an id (the hijack)', async () => {
    await expect(
      run(CreateMyClraWorkerDto, {
        id: uuid,
        workerCode: 'W1',
        fullName: 'Ravi',
      }),
    ).rejects.toThrow();
    await expect(
      run(CreateMyClraWorkerDto, { workerCode: 'W1', fullName: 'Ravi' }),
    ).resolves.toBeDefined();
  });

  it('validates CLRA updates instead of skipping them', async () => {
    await expect(
      run(UpdateClraAssignmentDto, { status: 'ACTIVE', createdAt: 'x' }),
    ).rejects.toThrow();
    await expect(
      run(UpdateClraAssignmentDto, { natureOfWork: 'Housekeeping' }),
    ).resolves.toEqual(
      expect.objectContaining({ natureOfWork: 'Housekeeping' }),
    );
  });
});
