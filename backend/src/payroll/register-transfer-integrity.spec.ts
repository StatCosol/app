import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import { PayrollRegistersService } from './payroll-registers.service';

describe('Complete register transfers and concurrent review', () => {
  let directory: string, file: string;
  beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'register-integrity-'));
    file = path.join(directory, 'evidence.xlsx');
    fs.writeFileSync(file, 'evidence');
  });
  afterAll(() => {
    fs.unlinkSync(file);
    fs.rmdirSync(directory);
  });
  const reader = {
    id: 'reader',
    roleCode: 'CLIENT',
    userType: 'MASTER',
    clientId: 'client',
  } as any;
  const reviewer = { id: 'reviewer', roleCode: 'ADMIN' } as any;
  function setup() {
    const row: any = {
      id: 'saved',
      clientId: 'client',
      branchId: 'branch',
      category: 'REGISTER',
      approvalStatus: 'PENDING',
      title: 'Register',
      fileName: 'evidence.xlsx',
      filePath: file,
    };
    const qb: any = {};
    for (const name of ['where', 'andWhere', 'orderBy', 'limit'])
      qb[name] = jest.fn(() => qb);
    qb.getMany = jest.fn(async () => [row]);
    const repo = {
      createQueryBuilder: () => qb,
      findOne: jest.fn(async () => row),
      update: jest.fn(async () => ({ affected: 1 })),
    };
    const service = new PayrollRegistersService(
      repo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { assertPayrollAccessToClient: jest.fn() } as any,
    );
    jest
      .spyOn(service, 'payrollListRegistersRecords')
      .mockResolvedValue({ ids: ['client'], q: {} });
    const version = async () =>
      (await service.payrollListRegistersFormatted(reviewer, {}))[0]
        .reviewVersion;
    return { row, qb, repo, service, version };
  }
  it.each(['client', 'payroll'])(
    'refuses missing, truncated or stale selections before starting a %s ZIP',
    async (portal) => {
      const { service, qb, row } = setup();
      const res = { setHeader: jest.fn() } as any;
      const download = (q: any = {}) =>
        portal === 'client'
          ? service.streamClientRegistersPack(reader, q, res)
          : service.streamPayrollRegistersPack(reviewer, q, res);
      qb.getMany.mockResolvedValue([
        row,
        {
          ...row,
          id: 'missing',
          filePath: path.join(directory, 'missing.xlsx'),
        },
      ]);
      await expect(download()).rejects.toBeInstanceOf(NotFoundException);
      qb.getMany.mockResolvedValue(Array(301).fill(row));
      await expect(download()).rejects.toBeInstanceOf(BadRequestException);
      qb.getMany.mockResolvedValue([row]);
      await expect(
        download({ registerIds: ['saved', 'no-longer-visible'] }),
      ).rejects.toThrow('Refresh');
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(qb.limit).toHaveBeenCalledWith(301);
    },
  );
  it.each(['client', 'payroll'])(
    'preserves extensions and unique bounded names in a %s ZIP',
    async (portal) => {
      const { service, qb, row } = setup();
      qb.getMany.mockResolvedValue(
        ['first', 'second'].map((id) => ({
          ...row,
          id,
          title: 'Long title '.repeat(25),
          registerType: 'Long type '.repeat(25),
          fileName: 'Long filename '.repeat(20) + '.xlsx',
        })),
      );
      const res = Object.assign(new PassThrough(), { setHeader: jest.fn() });
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      const ended = new Promise<void>((resolve, reject) => {
        res.on('end', resolve);
        res.on('error', reject);
      });
      const q = { registerIds: ['first', 'second'] };
      if (portal === 'client')
        await service.streamClientRegistersPack(reader, q, res as any);
      else await service.streamPayrollRegistersPack(reviewer, q, res as any);
      await ended;
      const zip = await require('unzipper').Open.buffer(Buffer.concat(chunks));
      expect(zip.files).toHaveLength(2);
      expect(new Set(zip.files.map((entry: any) => entry.path)).size).toBe(2);
      for (const entry of zip.files) {
        expect(entry.path).toMatch(/\.xlsx$/);
        expect(entry.path.length).toBeLessThanOrEqual(140);
        expect((await entry.buffer()).toString()).toBe('evidence');
      }
    },
  );
  it.each(['approve', 'reject'])(
    'rejects stale %s actions without overwriting replacement evidence',
    async (action) => {
      const { service, repo, row, version } = setup();
      repo.update.mockResolvedValue({ affected: 0 });
      await expect(
        action === 'approve'
          ? service.approveRegister(reviewer, row.id, await version())
          : service.rejectRegister(
              reviewer,
              row.id,
              undefined,
              await version(),
            ),
      ).rejects.toBeInstanceOf(ConflictException);
      const [criteria, changes] = repo.update.mock.calls[0] as any;
      expect(criteria).toEqual({
        id: row.id,
        filePath: file,
        approvalStatus: 'PENDING',
      });
      expect(Object.keys(changes).sort()).toEqual([
        'approvalStatus',
        'approvedAt',
        'approvedByUserId',
      ]);
    },
  );
  it('refuses a review opened before evidence replacement', async () => {
    const { service, repo, row, version } = setup();
    const oldVersion = await version();
    row.generatedAt = new Date('2026-10-02T00:00:00Z');
    await expect(
      service.approveRegister(reviewer, row.id, oldVersion),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.rejectRegister(reviewer, row.id, 'stale', oldVersion),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.update).not.toHaveBeenCalled();
  });
  it('refuses approval when the actual evidence file is missing', async () => {
    const { service, repo, row, version } = setup();
    row.filePath = path.join(directory, 'missing.xlsx');
    await expect(
      service.approveRegister(reviewer, row.id, await version()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.update).not.toHaveBeenCalled();
  });
});
