import 'reflect-metadata';
import { BranchComplianceService } from './branch-compliance.service';

// Every dependency is local: these checks never send mail or access a database.
function setup(filename = 'TEST-ONLY-return.pdf', status = 'SUBMITTED') {
  const doc = {
    id: 'synthetic-document',
    companyId: 'synthetic-company',
    branchId: 'synthetic-branch',
    uploadedByUserId: 'synthetic-uploader',
    uploadedFileName: filename,
    returnCode: 'PF_ECR',
    frequency: 'MONTHLY',
    periodMonth: 10,
    periodYear: 2050,
    dueDate: '2050-11-15',
    status,
    isLocked: status === 'APPROVED',
  };
  const repo = {
    findOne: jest.fn().mockResolvedValue(doc),
    save: jest.fn(async (value) => value),
  };
  const query = jest
    .fn()
    .mockResolvedValue([
      { email: 'recipient@example.invalid', branch_name: 'Synthetic branch' },
    ]);
  const mail = { sendMcdRejection: jest.fn().mockResolvedValue(undefined) };
  const svc = new BranchComplianceService(
    repo as any,
    {} as any,
    {} as any,
    { query } as any,
    {} as any,
    mail as any,
    { assertClientAllowed: jest.fn().mockResolvedValue(undefined) } as any,
  );
  const notification = jest.spyOn(svc as any, 'notifyMcdRejection');
  const review = (nextStatus = 'REUPLOAD_REQUIRED') =>
    svc.reviewDocument(
      { userId: 'synthetic-reviewer', roleCode: 'CRM' } as any,
      doc.id,
      {
        status: nextStatus,
        remarks: 'Synthetic correction: replace the test evidence.',
      } as any,
    );
  const finishNotification = async () => {
    if (notification.mock.results.length)
      await notification.mock.results.at(-1)!.value;
  };
  return { doc, repo, query, mail, review, finishNotification, notification };
}

describe('isolated compliance review notification safety', () => {
  it.each([
    'TEST-ONLY-return.pdf',
    'test_return.pdf',
    'TEST return.pdf',
    'TEST',
  ])(
    'retains correction remarks without contacting the uploader for %s',
    async (filename) => {
      const s = setup(filename);
      expect(await s.review()).toMatchObject({
        status: 'REUPLOAD_REQUIRED',
        isLocked: false,
        remarks: 'Synthetic correction: replace the test evidence.',
        reviewedByUserId: 'synthetic-reviewer',
      });
      await s.finishNotification();
      expect(s.repo.save).toHaveBeenCalledTimes(1);
      expect(s.query).not.toHaveBeenCalled();
      expect(s.mail.sendMcdRejection).not.toHaveBeenCalled();
    },
  );

  it('keeps normal monthly correction content and uploader routing through a mocked mail adapter', async () => {
    const s = setup('return.pdf');
    await s.review();
    await s.finishNotification();
    expect(s.query).toHaveBeenCalledWith(expect.any(String), [
      'synthetic-uploader',
      'synthetic-branch',
    ]);
    expect(s.mail.sendMcdRejection).toHaveBeenCalledWith({
      to: 'recipient@example.invalid',
      docName: 'PF_ECR',
      month: '10/2050',
      branchName: 'Synthetic branch',
      crmRemarks: 'Synthetic correction: replace the test evidence.',
      correctionRequired: 'Synthetic correction: replace the test evidence.',
      dueDate: '2050-11-15',
    });
  });

  it('locks a resubmission on approval without sending a rejection notification', async () => {
    const s = setup('TEST-corrected.pdf', 'RESUBMITTED');
    expect(await s.review('APPROVED')).toMatchObject({
      status: 'APPROVED',
      isLocked: true,
    });
    expect(s.notification).not.toHaveBeenCalled();
    expect(s.query).not.toHaveBeenCalled();
    expect(s.mail.sendMcdRejection).not.toHaveBeenCalled();
  });

  it('does not change or notify an already approved document', async () => {
    const s = setup('TEST-approved.pdf', 'APPROVED');
    await expect(s.review()).rejects.toThrow(
      'Cannot review document in status APPROVED',
    );
    expect(s.repo.save).not.toHaveBeenCalled();
    expect(s.mail.sendMcdRejection).not.toHaveBeenCalled();
  });

  it('preserves the saved review if the mail adapter fails', async () => {
    const s = setup('return.pdf');
    s.mail.sendMcdRejection.mockRejectedValueOnce(
      new Error('isolated mail failure'),
    );
    expect(await s.review()).toMatchObject({ status: 'REUPLOAD_REQUIRED' });
    await expect(s.finishNotification()).resolves.toBeUndefined();
    expect(s.repo.save).toHaveBeenCalledTimes(1);
  });

  it('does not send a notification when the uploader has no address', async () => {
    const s = setup('return.pdf');
    s.query.mockResolvedValueOnce([]);
    await s.review();
    await s.finishNotification();
    expect(s.mail.sendMcdRejection).not.toHaveBeenCalled();
  });
});
