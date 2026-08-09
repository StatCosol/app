import { AttendanceReviewActionService } from './attendance-review-action.service';

describe('AttendanceReviewActionService', () => {
  it('routes mobile borderline items to punch review', async () => {
    const punchReview = {
      reviewPunch: jest
        .fn()
        .mockResolvedValue({ ok: true, decision: 'REVIEW_APPROVED' }),
    };
    const facedeskAdmin = { actOnReview: jest.fn() };
    const service = new AttendanceReviewActionService(
      punchReview as any,
      facedeskAdmin as any,
    );

    const result = await service.actOnFederatedItem(
      'client-1',
      'MOBILE_BORDERLINE',
      'punch-1',
      'user-1',
      { action: 'APPROVE', note: 'ok' },
      null,
    );

    expect(result).toEqual({ ok: true, decision: 'REVIEW_APPROVED' });
    expect(punchReview.reviewPunch).toHaveBeenCalledWith(
      'client-1',
      'EMPLOYEE',
      'punch-1',
      'APPROVE',
      'user-1',
      'ok',
      null,
    );
    expect(facedeskAdmin.actOnReview).not.toHaveBeenCalled();
  });

  it('routes facedesk verification items to FaceDesk admin review', async () => {
    const punchReview = { reviewPunch: jest.fn() };
    const facedeskAdmin = {
      actOnReview: jest.fn().mockResolvedValue({ status: 'REJECTED' }),
    };
    const service = new AttendanceReviewActionService(
      punchReview as any,
      facedeskAdmin as any,
    );

    const result = await service.actOnFederatedItem(
      'client-1',
      'FACEDESK_VERIFICATION',
      'review-1',
      'user-1',
      { action: 'REJECT', note: 'mismatch' },
      ['branch-1'],
    );

    expect(result).toEqual({ ok: true, status: 'REJECTED' });
    expect(facedeskAdmin.actOnReview).toHaveBeenCalledWith(
      'client-1',
      'review-1',
      'user-1',
      { action: 'REJECT', remarks: 'mismatch' },
      ['branch-1'],
    );
  });

  it('forwards branch scope to mobile punch review', async () => {
    const punchReview = {
      reviewPunch: jest
        .fn()
        .mockResolvedValue({ ok: true, decision: 'REVIEW_APPROVED' }),
    };
    const facedeskAdmin = { actOnReview: jest.fn() };
    const service = new AttendanceReviewActionService(
      punchReview as any,
      facedeskAdmin as any,
    );

    await service.actOnFederatedItem(
      'client-1',
      'MOBILE_BORDERLINE',
      'punch-1',
      'user-1',
      { action: 'APPROVE' },
      ['branch-1'],
    );

    expect(punchReview.reviewPunch).toHaveBeenCalledWith(
      'client-1',
      'EMPLOYEE',
      'punch-1',
      'APPROVE',
      'user-1',
      undefined,
      ['branch-1'],
    );
  });
});
