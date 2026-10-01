import { ForbiddenException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import { PayrollRegistersService } from './payroll-registers.service';
import { ReqUser } from '../access/access-scope.service';
import { REGISTER_FORMS } from './register-library/register-catalogue';
import { legalRegisterType } from './register-library/register-identity';

describe('Register downloads in LegitX and BranchDesk', () => {
  const clientId = 'client-a',
    branchId = 'branch-a';
  const legalType = legalRegisterType(REGISTER_FORMS[0].id);
  let fixtureDir: string, filePath: string;
  const bytes = Buffer.from('prepared register evidence');
  beforeAll(() => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'register-downloads-'));
    filePath = path.join(fixtureDir, 'register.xlsx');
    fs.writeFileSync(filePath, bytes);
  });
  afterAll(() => {
    fs.unlinkSync(filePath);
    fs.rmdirSync(fixtureDir);
  });
  const user = (userType = 'BRANCH') =>
    ({
      id: 'user-a',
      userId: 'user-a',
      roleCode: 'CLIENT',
      clientId,
      userType,
      branchIds: [branchId],
    }) as ReqUser;
  function setup(changes: any = {}, settings: any = {}) {
    const row = {
      id: 'register-a',
      clientId,
      branchId,
      title: 'Register',
      registerType: legalType,
      payrollInputId: null,
      approvalStatus: 'APPROVED',
      filePath,
      fileName: 'register.xlsx',
      fileType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      periodYear: 2026,
      periodMonth: 9,
      ...changes,
    };
    const qb: any = {};
    for (const method of ['where', 'andWhere', 'orderBy', 'limit'])
      qb[method] = jest.fn(() => qb);
    qb.getMany = jest.fn(async () => [row]);
    const repo = {
      findOne: jest.fn(async () => row),
      createQueryBuilder: jest.fn(() => qb),
    };
    const service = new PayrollRegistersService(
      repo as any,
      {} as any,
      {} as any,
      {} as any,
      {
        findOne: jest.fn(async () => ({
          settings: {
            allowBranchPayrollAccess: true,
            allowBranchWageRegisters: true,
            allowBranchSalaryRegisters: true,
            ...settings,
          },
        })),
      } as any,
      {} as any,
    );
    return { service, qb, repo, row };
  }
  it.each(['MASTER', 'BRANCH'])(
    'lists library files as generated and downloads bytes for %s',
    async (userType) => {
      const { service } = setup();
      expect(
        (await service.clientListRegistersRecords(user(userType), {}))[0],
      ).toMatchObject({
        sourceType: 'GENERATED',
        payrollInputId: null,
        legalIdentity: expect.any(Object),
      });
      expect(
        (await service.downloadRegisterForClient(user(userType), 'register-a'))
          .buffer,
      ).toEqual(bytes);
    },
  );
  it('distinguishes manual uploads and legacy payroll-generated files', async () => {
    expect(
      (
        await setup({ registerType: null }).service.clientListRegistersRecords(
          user('MASTER'),
          {},
        )
      )[0].sourceType,
    ).toBe('MANUAL');
    expect(
      (
        await setup({
          registerType: null,
          payrollInputId: 'input-a',
        }).service.clientListRegistersRecords(user('MASTER'), {})
      )[0].sourceType,
    ).toBe('GENERATED');
  });
  it('restricts branch lists to the client, assigned and enabled branches, approval and selected source', async () => {
    const { service, qb } = setup(
      {},
      { payrollBranchScope: 'SELECTED', payrollAllowedBranchIds: [branchId] },
    );
    await service.clientListRegistersRecords(user(), {
      sourceType: 'GENERATED',
      periodYear: 2026,
      periodMonth: 9,
    });
    expect(qb.where).toHaveBeenCalledWith('r.client_id = :cid', {
      cid: clientId,
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'r.branch_id IN (:...userBranches)',
      { userBranches: [branchId] },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'r.branch_id IN (:...enabledBranches)',
      { enabledBranches: [branchId] },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('r.approval_status = :approved', {
      approved: 'APPROVED',
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining("'LEGAL_'"),
    );
  });
  it.each([
    { clientId: 'other' },
    { branchId: 'other' },
    { branchId: null },
    { approvalStatus: 'PENDING' },
  ])(
    'rejects a register outside the branch download scope: %j',
    async (changes) => {
      await expect(
        setup(changes).service.downloadRegisterForClient(user(), 'register-a'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  it.each([
    { allowBranchPayrollAccess: false },
    { payrollBranchScope: 'SELECTED', payrollAllowedBranchIds: [] },
    { allowBranchWageRegisters: false },
    { allowBranchSalaryRegisters: false },
  ])('enforces download settings: %j', async (settings) => {
    await expect(
      setup(
        { title: 'Wage and salary register' },
        settings,
      ).service.downloadRegisterForClient(user(), 'register-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('reports a missing file as unavailable, with regeneration instructions', async () => {
    await expect(
      setup({
        filePath: path.join(fixtureDir, 'missing.xlsx'),
      }).service.downloadRegisterForClient(user(), 'register-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('produces a readable ZIP with generated source labels and original evidence bytes', async () => {
    const { service } = setup();
    const response = Object.assign(new PassThrough(), { setHeader: jest.fn() });
    const chunks: Buffer[] = [];
    response.on('data', (chunk) => chunks.push(chunk));
    const ended = new Promise<void>((resolve, reject) => {
      response.on('end', resolve);
      response.on('error', reject);
    });
    await service.streamClientRegistersPack(
      user(),
      { sourceType: 'GENERATED' },
      response as any,
    );
    await ended;
    const zip = await require('unzipper').Open.buffer(Buffer.concat(chunks));
    expect(zip.files).toHaveLength(1);
    expect(zip.files[0].path).toContain('_generated_');
    expect(await zip.files[0].buffer()).toEqual(bytes);
  });
});
