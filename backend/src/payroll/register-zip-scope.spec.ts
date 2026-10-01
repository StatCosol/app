import 'reflect-metadata';
import { ReviewRegisterDto } from './dto/payroll-setup.dto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegistersPackSelectionDto } from './dto/payroll-query-params.dto';
import {
  PayrollController,
  ClientRegistersRecordsController,
} from './payroll.controller';
import { PayrollRegistersService } from './payroll-registers.service';

describe('Payroll ZIP scope follows the displayed registers', () => {
  const id1 = '11111111-1111-4111-8111-111111111111';
  const id2 = '22222222-2222-4222-8222-222222222222';
  it('transforms and validates a bounded list of saved register IDs', () => {
    const dto = plainToInstance(RegistersPackSelectionDto, {
      registerIds: id1 + ',' + id2,
    });
    expect(validateSync(dto)).toEqual([]);
    expect(dto.registerIds).toEqual([id1, id2]);
    for (const registerIds of [
      '',
      'bad-id',
      [id1, 'bad-id'],
      Array(301).fill(id1),
    ]) {
      expect(
        validateSync(
          plainToInstance(RegistersPackSelectionDto, { registerIds }),
        ).length,
      ).toBeGreaterThan(0);
    }
  });
  it('passes validated selected files to the same scoped ZIP service with matching reader roles', async () => {
    const svc = { streamPayrollRegistersPack: jest.fn() };
    const controller = new PayrollController(svc as any);
    const reader = { id: 'payroll-reader', roleCode: 'PAYROLL' } as any;
    const response = {} as any;
    await controller.downloadSelectedRegistersPack(
      reader,
      { clientId: id1, branchId: id2 },
      { registerIds: [id1] },
      response,
    );
    expect(svc.streamPayrollRegistersPack).toHaveBeenCalledWith(
      reader,
      { clientId: id1, branchId: id2, registerIds: [id1] },
      response,
    );
    expect(
      Reflect.getMetadata(
        'roles',
        Object.getOwnPropertyDescriptor(
          PayrollController.prototype,
          'downloadSelectedRegistersPack',
        )!.value,
      ),
    ).toEqual(['PAYROLL', 'ADMIN', 'CRM', 'CEO', 'CCO']);
  });
  it('requires a valid review version and forwards client ZIP selections through the scoped service', async () => {
    expect(
      validateSync(plainToInstance(ReviewRegisterDto, {})),
    ).not.toHaveLength(0);
    expect(
      validateSync(
        plainToInstance(ReviewRegisterDto, { reviewVersion: 'a'.repeat(64) }),
      ),
    ).toEqual([]);
    const svc = { streamClientRegistersPack: jest.fn() };
    const controller = new ClientRegistersRecordsController(svc as any);
    const user = { id: 'client-user', roleCode: 'CLIENT' } as any,
      response = {} as any;
    await controller.downloadSelectedPack(
      user,
      { branchId: id2 },
      { registerIds: [id1] },
      response,
    );
    expect(svc.streamClientRegistersPack).toHaveBeenCalledWith(
      user,
      { branchId: id2, registerIds: [id1] },
      response,
    );
    expect(
      Reflect.getMetadata('roles', ClientRegistersRecordsController),
    ).toEqual(['CLIENT']);
  });
  it('intersects requested file IDs with tenant, branch, period and type restrictions', async () => {
    const qb: any = {};
    for (const method of ['where', 'andWhere', 'orderBy'])
      qb[method] = jest.fn(() => qb);
    qb.getMany = jest.fn(async () => []);
    const service = new PayrollRegistersService(
      { createQueryBuilder: () => qb } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await service.payrollListRegistersFormatted(
      { id: 'admin', roleCode: 'ADMIN' } as any,
      {
        clientId: id1,
        branchId: id2,
        periodYear: 2026,
        periodMonth: 3,
        registerType: 'LEGAL_sample',
        registerIds: [id1],
      },
    );
    expect(qb.where).toHaveBeenCalledWith('r.client_id IN (:...ids)', {
      ids: [id1],
    });
    expect(qb.andWhere).toHaveBeenCalledWith('r.branch_id = :b', { b: id2 });
    expect(qb.andWhere).toHaveBeenCalledWith('r.period_month = :m', { m: 3 });
    expect(qb.andWhere).toHaveBeenCalledWith('r.register_type = :rt', {
      rt: 'LEGAL_sample',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('r.id IN (:...registerIds)', {
      registerIds: [id1],
    });
  });
});
