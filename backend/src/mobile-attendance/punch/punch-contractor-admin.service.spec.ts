import { BadRequestException, NotFoundException } from '@nestjs/common';
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
