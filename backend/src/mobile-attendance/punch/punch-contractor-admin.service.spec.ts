import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  contractorPunchSource,
  PunchContractorAdminService,
} from './punch-contractor-admin.service';

const ZERO = '00000000-0000-0000-0000-000000000000';

describe('contractorPunchSource', () => {
  it('calls a punch with face evidence a face punch, even from the web kiosk', () => {
    // FaceDesk web punches carry the same all-zero device id as manual ones.
    expect(contractorPunchSource({ deviceId: ZERO, matchCosine: 0.82 })).toBe(
      'FACE',
    );
    expect(contractorPunchSource({ deviceId: ZERO, photoUrl: 'p.jpg' })).toBe(
      'FACE',
    );
    expect(
      contractorPunchSource({ deviceId: 'dev-1', embeddingModel: 'arcface' }),
    ).toBe('FACE');
  });

  it('calls a punch with no evidence and no device manual', () => {
    expect(contractorPunchSource({ deviceId: ZERO })).toBe('MANUAL');
    expect(contractorPunchSource({ deviceId: null })).toBe('MANUAL');
  });

  it('calls a real device with no face evidence a device punch', () => {
    expect(contractorPunchSource({ deviceId: 'essl-1' })).toBe('DEVICE');
  });
});

describe('PunchContractorAdminService edits', () => {
  const build = (punch: object | null, employeeBranch = 'br-1') => {
    const repo = {
      findOne: jest.fn(async () => punch),
      save: jest.fn(async (v) => ({ ...v, punchTime: new Date(v.punchTime) })),
      delete: jest.fn(async () => ({ affected: 1 })),
      query: jest.fn(async (_sql: string, _params?: unknown[]) => [
        { branch_id: employeeBranch },
      ]),
    };
    return { svc: new PunchContractorAdminService(repo as never), repo };
  };
  const face = {
    id: 'p1',
    deviceId: ZERO,
    matchCosine: 0.9,
    photoUrl: 'x.jpg',
    contractorEmployeeId: 'e1',
    branchId: 'br-1',
    punchTime: new Date(),
  };
  const manual = { ...face, matchCosine: null, photoUrl: null };

  it('refuses to edit or delete a face punch — the screen check never fired', async () => {
    const { svc, repo } = build(face);
    await expect(
      svc.updateContractorPunch('c1', 'p1', { direction: 'OUT' }),
    ).rejects.toThrow(BadRequestException);
    await expect(svc.deleteContractorPunch('c1', 'p1')).rejects.toThrow(
      BadRequestException,
    );
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('edits and deletes a manual punch', async () => {
    const { svc, repo } = build(manual);
    await svc.updateContractorPunch('c1', 'p1', { direction: 'OUT' });
    await svc.deleteContractorPunch('c1', 'p1');
    expect(repo.save).toHaveBeenCalled();
    expect(repo.delete).toHaveBeenCalled();
  });

  it('keeps a branch user out of another branch’s punch', async () => {
    const { svc } = build({ ...manual, branchId: null }, 'br-2');
    await expect(
      svc.deleteContractorPunch('c1', 'p1', ['br-1']),
    ).rejects.toThrow(NotFoundException);
  });

  it('only creates a punch for this client’s employee, on their branch', async () => {
    const { svc, repo } = build(null);
    await svc.createContractorPunch('c1', {
      contractorEmployeeId: 'e1',
      punchTime: '2026-09-19T09:00:00Z',
      direction: 'IN',
    });
    expect(repo.query.mock.calls[0][1]).toEqual(['e1', 'c1']);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'br-1' }),
    );

    repo.query.mockImplementation(async () => []);
    await expect(
      svc.createContractorPunch('c1', {
        contractorEmployeeId: 'someone-elses',
        punchTime: '2026-09-19T09:00:00Z',
        direction: 'IN',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('PunchContractorAdminService export', () => {
  it('exports numeric daily OT including breaks', async () => {
    const svc = new PunchContractorAdminService({} as never);
    jest.spyOn(svc, 'listContractorPunches').mockResolvedValue([
      {
        id: 'in',
        contractorEmployeeId: 'e1',
        punchTime: new Date('2026-10-08T03:30:00Z'),
        direction: 'IN',
      },
      {
        id: 'out',
        contractorEmployeeId: 'e1',
        punchTime: new Date('2026-10-08T13:00:00Z'),
        direction: 'OUT',
      },
    ] as never);
    const exported = await svc.exportContractorAttendance('c1', {});
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.buffer as never);
    const sheet = workbook.getWorksheet('Contractor Attendance')!;
    expect(sheet.getCell('G2').value).toBe(9.5);
    expect(sheet.getCell('H1').value).toBe('OT Hours (above 8h 30m)');
    expect(sheet.getCell('H2').value).toBe(1);
  });
  it('formats punch dates and times in India time', async () => {
    const qb = {
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn(async () => ({
        entities: [
          {
            id: 'p1',
            contractorEmployeeId: 'ce1',
            punchTime: new Date('2026-09-26T01:13:00.000Z'),
            direction: 'IN',
            deviceId: ZERO,
            photoUrl: 'face.jpg',
            matchScore: 0.94,
            matchCosine: null,
            livenessScore: 0.9,
            captureLat: null,
            captureLng: null,
            branchId: 'br-1',
            decision: 'AUTO',
          },
        ],
        raw: [
          {
            ceName: 'Akhil Jena',
            ceCode: 'SSR0170',
            ceContractorUserId: 'cu1',
            ceBranchId: 'br-1',
            cuName: 'Sai Sri',
          },
        ],
      })),
    };
    const repo = {
      createQueryBuilder: jest.fn(() => qb),
    };
    const svc = new PunchContractorAdminService(repo as never);

    const exported = await svc.exportContractorAttendance('client-1', {
      contractorUserId: 'cu1',
      from: '2026-09-26T00:00:00.000Z',
      to: '2026-09-26T23:59:59.999Z',
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.buffer as never);
    const sheet = workbook.getWorksheet('Contractor Attendance');
    expect(sheet?.getCell('A2').value).toBe('2026-09-26');
    expect(sheet?.getCell('E2').value).toBe('06:43');
    expect(qb.andWhere).toHaveBeenCalledWith('p.punchTime >= :from', {
      from: '2026-09-25T18:30:00.000Z',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('p.punchTime <= :to', {
      to: '2026-09-26T18:29:59.999Z',
    });
  });
});
