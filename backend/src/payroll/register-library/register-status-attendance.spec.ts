import { registerStatusAttendance } from './register-status-attendance';
import { registerLayout } from './register-layouts';
import { REGISTER_FORMS } from './register-catalogue';
import { RegisterInput, validateRegister } from './register-workbook';

const rows = () =>
  Array.from({ length: 30 }, (_, i) => ({
    employee_id: 'employee',
    name: 'Sample worker',
    father_name: 'Sample parent',
    designation: 'Guard',
    department: 'Security',
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    status: i === 0 ? 'HALF_DAY' : 'PRESENT',
    overtime_hours: '0',
  }));
describe('Rajasthan prescribed identities and attendance', () => {
  it('separates state form numbers from Central form numbers and columns', () => {
    expect(registerLayout('rjw', 'IV')?.baseFormNumber).toBe('I');
    expect(registerLayout('rjw', 'I')?.fields.map((f) => f.key)).not.toContain(
      'basic',
    );
    expect(registerLayout('rjw', 'IV')?.fields.map((f) => f.key)).not.toContain(
      'employee_7',
    );
    expect(registerLayout('rjw', 'V')?.attendanceMode).toBe('STATUS');
    expect(
      registerLayout('rjw', 'V')?.fields.some((f) => f.key === 'day1In'),
    ).toBe(false);
    expect(registerLayout('rjw', 'VII')?.baseFormNumber).toBe('V');
  });
  it('loads approved scoped statuses and never invents paid days', async () => {
    const query = jest.fn().mockResolvedValue(rows());
    const result = await registerStatusAttendance(
      { query } as any,
      'client',
      'branch',
      2026,
      9,
    );
    expect(query.mock.calls[0][1]).toEqual([
      'client',
      'branch',
      '2026-09-01',
      '2026-09-30',
    ]);
    expect(query.mock.calls[0][0]).toContain("a.approval_status='APPROVED'");
    expect(result.rows[0]).toMatchObject({
      day1Status: 'HD',
      daysWorked: 29.5,
      restDays: 0,
      leaveDays: 0,
      otHours: 0,
    });
    expect(result.rows[0].paidDays).toBeUndefined();
  });
  it('leaves totals blank for incomplete attendance and rejects duplicates', async () => {
    const data = rows();
    data.pop();
    const result = await registerStatusAttendance(
      { query: jest.fn().mockResolvedValue(data) } as any,
      'client',
      'branch',
      2026,
      9,
    );
    expect(result.rows[0].daysWorked).toBeUndefined();
    await expect(
      registerStatusAttendance(
        { query: jest.fn().mockResolvedValue([data[0], data[0]]) } as any,
        'client',
        'branch',
        2026,
        9,
      ),
    ).rejects.toThrow('Duplicate');
  });
  it('reconciles daily status totals and rejects invented calendar days', async () => {
    const result = await registerStatusAttendance(
      { query: jest.fn().mockResolvedValue(rows()) } as any,
      'client',
      'branch',
      2026,
      9,
    );
    const form = REGISTER_FORMS.find(
      (f) => f.sourceId === 'rjw' && f.formNumber === 'V',
    )!;
    const input: RegisterInput = {
      branchId: '11111111-1111-4111-8111-111111111111',
      year: 2026,
      month: 9,
      employer: 'Sample',
      owner: 'Sample',
      registrationNumber: 'SAMPLE',
      employerPan: 'ABCDE1234F',
      issueDate: '2026-09-30',
      rows: [{ ...result.rows[0], paidDays: 30 }],
    };
    expect(validateRegister(form.id, input)).toEqual([]);
    input.rows[0].daysWorked = 30;
    input.rows[0].day31Status = 'P';
    expect(validateRegister(form.id, input).join(' ')).toContain(
      'days present do not match',
    );
    expect(validateRegister(form.id, input).join(' ')).toContain(
      'day 31 does not exist',
    );
  });
});
