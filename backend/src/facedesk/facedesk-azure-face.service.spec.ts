import { FaceDeskAzureFaceService } from './facedesk-azure-face.service';
import { activeFaceDeskSubjectSql } from './facedesk-active-subject.util';

describe('Azure duplicate roster eligibility', () => {
  it('skips a stale match and continues to the current enrolled employee', async () => {
    const query = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn()
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
      { findOne: jest.fn().mockResolvedValue({ azureFaceListId: 'sc-client' }) } as any,
      { createQueryBuilder: jest.fn().mockReturnValue(query) } as any,
    );
    const hit = await service.findDuplicate('client', 'YWJj', 'SSR0244');
    expect(hit?.matchedEmployeeId).toBe('SSR0159');
    expect(query.getOne).toHaveBeenCalledTimes(2);
    expect(query.andWhere).toHaveBeenCalledWith(activeFaceDeskSubjectSql('p'));
    expect(query.andWhere).toHaveBeenCalledWith("p.enrollment_status = 'ENROLLED'");
  });
});
