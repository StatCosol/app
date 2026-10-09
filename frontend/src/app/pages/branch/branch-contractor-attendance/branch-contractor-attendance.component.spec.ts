import { vi } from 'vitest';
import { BranchContractorAttendanceComponent } from './branch-contractor-attendance.component';

describe('Branch contractor attendance rows', () => {
  type Args = ConstructorParameters<typeof BranchContractorAttendanceComponent>;
  const toast = { error: vi.fn(), success: vi.fn() };
  const dialog = { prompt: vi.fn(), confirm: vi.fn() };
  const component = new BranchContractorAttendanceComponent(
    {} as Args[0],
    toast as unknown as Args[1],
    dialog as unknown as Args[2],
    { markForCheck: vi.fn() } as unknown as Args[3],
    {} as Args[4],
  );
  const punch = (over: Record<string, unknown>) => ({
    id: 'p',
    contractorEmployeeId: 'e1',
    contractorEmployeeName: 'Ravi',
    employeeCode: 'SBS0001',
    contractorUserId: 'cu',
    contractorName: 'Jilkari Shiva Kumar',
    branchId: 'br',
    punchTime: '2026-09-19T04:30:00.000Z',
    direction: 'IN',
    source: 'FACE',
    deviceId: null,
    photoUrl: 'x',
    matchScore: '0.87',
    livenessScore: null,
    captureLat: null,
    captureLng: null,
    ...over,
  });
  const rows = (punches: unknown[]) =>
    (component as any).toAttendanceRows(punches);

  it('pairs an employee’s IN and OUT on one day into one row with name and code', () => {
    const [row] = rows([
      punch({ id: 'in' }),
      punch({ id: 'out', direction: 'OUT', punchTime: '2026-09-19T13:30:00.000Z' }),
    ]);
    expect(row.contractorEmployeeName).toBe('Ravi');
    expect(row.employeeCode).toBe('SBS0001');
    expect(row.punchCount).toBe(2);
    expect(row.outTime).toBe('2026-09-19T13:30:00.000Z');
    expect(row.hours).not.toBe('-');
  });

  it('never offers edit or delete on a face punch', async () => {
    const [row] = rows([punch({})]);
    expect(row.editable).toBe(false);
    await component.deleteRow(row);
    expect(dialog.confirm).not.toHaveBeenCalled();
  });

  it('offers edit only when every punch in the row is manual', () => {
    const [mixed] = rows([
      punch({ id: 'in', source: 'FACE' }),
      punch({ id: 'out', direction: 'OUT', source: 'MANUAL', punchTime: '2026-09-19T13:30:00.000Z' }),
    ]);
    expect(mixed.editable).toBe(false);
    const [manual] = rows([punch({ source: 'MANUAL', photoUrl: null })]);
    expect(manual.editable).toBe(true);
  });

  it('labels the source', () => {
    expect(component.sourceLabel('FACE')).toBe('Face');
    expect(component.sourceLabel('MANUAL')).toBe('Manual');
    expect(component.sourceLabel(undefined)).toBe('-');
  });

  it.each([['12:30', '8.00', '0.00'], ['13:00', '8.50', '0.00'], ['13:30', '9.00', '0.50'], ['14:00', '9.50', '1.00']])(
    'shows daily total and OT for an exit at %s UTC', (end, hours, otHours) => {
      const [row] = rows([punch({}), punch({ id: 'out', direction: 'OUT', punchTime: `2026-09-19T${end}:00Z` })]);
      expect(row.hours).toBe(hours);
      expect(row.otHours).toBe(otHours);
    },
  );
  it('leaves OT unknown for missing OUT or repeated IN punches', () => {
    expect(rows([punch({})])[0].otHours).toBe('-');
    expect(rows([punch({}), punch({ punchTime: '2026-09-19T15:30:00Z' })])[0].otHours).toBe('-');
  });
  it('keeps the displayed day and manual edit times in India time', () => {
    const instance = component as any;
    expect(instance.attendanceDayKey('2026-10-08T20:00:00Z')).toBe('2026-10-09');
    expect(instance.timeValue('2026-10-08T20:00:00Z')).toBe('01:30');
    expect(instance.localDateTimeToIso('2026-10-08T20:00:00Z', '01:30')).toBe('2026-10-08T20:00:00.000Z');
  });
});
