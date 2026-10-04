import { validate } from 'class-validator';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { PayrollRunsService } from './payroll-runs.service';

describe('separate monthly Intern payroll runs', () => {
  function fixture() {
    const regular = { id: 'regular-run', payrollCategory: 'REGULAR' };
    const svc = new (PayrollRunsService as any)();
    svc.scope = { assertPayrollAccessToClient: jest.fn() };
    svc.runRepo = {
      findOne: jest.fn(async ({ where }) =>
        where.payrollCategory === 'REGULAR' ? regular : null,
      ),
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => ({ ...v, id: 'intern-run' })),
    };
    svc.employeeRepo = {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: 'intern', employeeCode: 'I001', name: 'Intern' },
        ]),
    };
    svc.runEmployeeRepo = { create: jest.fn((v) => v), save: jest.fn() };
    return svc;
  }
  const user = { id: 'admin', roleCode: 'ADMIN' };
  const dto = {
    clientId: 'client',
    periodYear: 2026,
    periodMonth: 10,
    payrollCategory: 'INTERN',
  };

  it('creates an intern run alongside regular payroll and seeds only interns', async () => {
    const svc = fixture();
    const run = await svc.createPayrollRun(user, dto);
    expect(run).toMatchObject({
      payrollCategory: 'INTERN',
      title: 'Intern Payroll',
      employeeCount: 1,
    });
    expect(svc.employeeRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clientId: 'client',
          isActive: true,
          payrollCategory: 'INTERN',
        },
      }),
    );
  });

  it('defaults existing callers to Regular and rejects a duplicate category', async () => {
    const svc = fixture();
    await expect(
      svc.createPayrollRun(user, { ...dto, payrollCategory: undefined }),
    ).rejects.toThrow('already exists');
    expect(svc.runRepo.save).not.toHaveBeenCalled();
  });

  it('limits intern seeding and duplicate lookup to the selected branch', async () => {
    const svc = fixture();
    await svc.createPayrollRun(user, { ...dto, branchId: 'branch' });
    expect(svc.employeeRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branchId: 'branch',
          payrollCategory: 'INTERN',
        }),
      }),
    );
    expect(svc.runRepo.findOne).toHaveBeenCalledWith({
      where: expect.objectContaining({
        branchId: 'branch',
        payrollCategory: 'INTERN',
      }),
    });
  });

  it('rejects an invalid category at the API boundary', async () => {
    const input = Object.assign(new CreatePayrollRunDto(), {
      ...dto,
      payrollCategory: 'OTHER',
    });
    expect(
      (await validate(input)).some((e) => e.property === 'payrollCategory'),
    ).toBe(true);
  });
});
