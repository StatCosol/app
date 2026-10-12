import { FaceDeskAzureFaceService } from './facedesk-azure-face.service';
import { activeFaceDeskSubjectSql } from './facedesk-active-subject.util';

describe('Azure duplicate roster eligibility', () => {
  it('skips a stale match and continues to the current enrolled employee', async () => {
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ employeeId: 'SSR0159' }),
    };
    const azure = {
      identificationEnabled: true,
      configured: true,
      ensureLargeFaceList: jest.fn(),
      detectFace: jest.fn().mockResolvedValue({ faceId: 'probe' }),
      findSimilar: jest.fn().mockResolvedValue([
        { persistedFaceId: 'deleted-SSR0234', confidence: 0.99 },
        { persistedFaceId: 'current-SSR0159', confidence: 0.98 },
      ]),
    };
    const service = new FaceDeskAzureFaceService(
      azure as any,
      {
        findOne: jest.fn().mockResolvedValue({ azureFaceListId: 'sc-client' }),
      } as any,
      { createQueryBuilder: jest.fn().mockReturnValue(query) } as any,
    );
    const hit = await service.findDuplicate('client', 'YWJj', 'SSR0244');
    expect(hit?.matchedEmployeeId).toBe('SSR0159');
    expect(query.getOne).toHaveBeenCalledTimes(2);
    expect(query.andWhere).toHaveBeenCalledWith(activeFaceDeskSubjectSql('p'));
    expect(query.andWhere).toHaveBeenCalledWith(
      "p.enrollment_status = 'ENROLLED'",
    );
  });
});

describe('Azure attendance roster eligibility', () => {
  function serviceFor(profiles: Array<{ employeeId: string } | null>) {
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    for (const profile of profiles) query.getOne.mockResolvedValueOnce(profile);
    const azure = {
      identificationEnabled: true,
      detectFace: jest.fn().mockResolvedValue({ faceId: 'probe' }),
      findSimilar: jest.fn().mockResolvedValue([
        { persistedFaceId: 'face-a', confidence: 0.99 },
        { persistedFaceId: 'face-b', confidence: 0.98 },
      ]),
    };
    return {
      query,
      service: new FaceDeskAzureFaceService(
        azure as any,
        {} as any,
        { createQueryBuilder: jest.fn().mockReturnValue(query) } as any,
      ),
    };
  }

  it('ignores a deleted or inactive top face before evaluating ambiguity', async () => {
    const { service, query } = serviceFor([null, { employeeId: 'SSR0244' }]);
    await expect(
      service.identifyForAttendance('client', 'YWJj'),
    ).resolves.toEqual({
      ok: true,
      employeeId: 'SSR0244',
      confidence: 0.98,
      margin: 0.98,
    });
    expect(query.andWhere).toHaveBeenCalledWith(activeFaceDeskSubjectSql('p'));
    expect(query.andWhere).toHaveBeenCalledWith(
      "p.enrollment_status = 'ENROLLED'",
    );
  });

  it('still rejects two close active identities', async () => {
    const { service } = serviceFor([{ employeeId: 'a' }, { employeeId: 'b' }]);
    await expect(
      service.identifyForAttendance('client', 'YWJj'),
    ).resolves.toEqual({
      ok: false,
      reason: 'AMBIGUOUS',
    });
  });

  it('ignores a deleted runner-up after a valid top match', async () => {
    const { service } = serviceFor([{ employeeId: 'SSR0244' }, null]);
    await expect(
      service.identifyForAttendance('client', 'YWJj'),
    ).resolves.toEqual({
      ok: true,
      employeeId: 'SSR0244',
      confidence: 0.99,
      margin: 0.99,
    });
  });

  it('does not treat two faces for one active subject as two identities', async () => {
    const { service } = serviceFor([
      { employeeId: 'SSR0244' },
      { employeeId: 'SSR0244' },
    ]);
    await expect(
      service.identifyForAttendance('client', 'YWJj'),
    ).resolves.toEqual({
      ok: true,
      employeeId: 'SSR0244',
      confidence: 0.99,
      margin: 0.99,
    });
  });

  it('returns no match when every Azure candidate is ineligible', async () => {
    const { service } = serviceFor([null, null]);
    await expect(
      service.identifyForAttendance('client', 'YWJj'),
    ).resolves.toEqual({
      ok: false,
      reason: 'NO_MATCH',
    });
  });
});
