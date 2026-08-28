import { FaceDeskEnrollmentService } from './facedesk-enrollment.service';

function makeService(
  duplicateStatus: 'APPROVED' | 'CLEAR',
  hasClearedAlert: boolean,
) {
  const profileRepo = {
    findOne: jest.fn().mockResolvedValue({ duplicateStatus }),
  };
  const dupeRepo = {
    findOne: jest.fn().mockResolvedValue(hasClearedAlert ? {} : null),
  };
  const service = new FaceDeskEnrollmentService(
    profileRepo as any,
    {} as any,
    dupeRepo as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, profileRepo, dupeRepo };
}

describe('FaceDeskEnrollmentService approved duplicate clearance', () => {
  it('allows only the exact cleared pair after admin approval', async () => {
    const { service, dupeRepo } = makeService('APPROVED', true);

    await expect(
      (service as any).hasApprovedDuplicateClearance(
        'client-1',
        'employee-new',
        'employee-matched',
      ),
    ).resolves.toBe(true);

    expect(dupeRepo.findOne).toHaveBeenCalledWith({
      where: expect.arrayContaining([
        expect.objectContaining({
          clientId: 'client-1',
          newEmployeeId: 'employee-new',
          matchedEmployeeId: 'employee-matched',
          detectionBand: 'BLOCK',
        }),
      ]),
    });
  });

  it('does not allow a clearance without the approved profile state', async () => {
    const { service, dupeRepo } = makeService('CLEAR', true);

    await expect(
      (service as any).hasApprovedDuplicateClearance(
        'client-1',
        'employee-new',
        'employee-matched',
      ),
    ).resolves.toBe(false);

    expect(dupeRepo.findOne).not.toHaveBeenCalled();
  });
});
