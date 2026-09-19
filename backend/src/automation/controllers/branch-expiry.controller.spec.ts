import { BranchExpiryController } from './branch-expiry.controller';
import { AiAuditObservationLearningService } from '../../ai/ai-audit-observation-learning.service';

describe('BranchExpiryController', () => {
  const build = (branchIds: string[]) => {
    const svc = {
      listForClient: jest.fn(async () => ['client-wide']),
      listForBranch: jest.fn(async () => ['branch-only']),
    };
    const access = { getUserBranchIds: jest.fn(async () => branchIds) };
    return {
      ctl: new BranchExpiryController(svc as never, access as never),
      svc,
    };
  };

  it('shows a company-wide user every branch of their client', async () => {
    // Their branch list is empty, which used to show them nothing at all.
    const { ctl, svc } = build([]);
    await ctl.list({
      userId: 'u',
      clientId: 'c1',
      userType: 'MASTER',
    } as never);
    expect(svc.listForClient).toHaveBeenCalledWith('c1');
    expect(svc.listForBranch).not.toHaveBeenCalled();
  });

  it('keeps a branch user to their branches, and to nothing when unmapped', async () => {
    const mapped = build(['b1']);
    await mapped.ctl.list({
      userId: 'u',
      clientId: 'c1',
      userType: 'BRANCH',
    } as never);
    expect(mapped.svc.listForBranch).toHaveBeenCalledWith(['b1']);
    expect(mapped.svc.listForClient).not.toHaveBeenCalled();

    const unmapped = build([]);
    await unmapped.ctl.list({
      userId: 'u',
      clientId: 'c1',
      userType: 'BRANCH',
    } as never);
    expect(unmapped.svc.listForBranch).toHaveBeenCalledWith([]);
    expect(unmapped.svc.listForClient).not.toHaveBeenCalled();
  });
});

describe('AI remark library search', () => {
  it('returns the reusable wording without the source client or raw notes', async () => {
    const svc = Object.create(
      AiAuditObservationLearningService.prototype,
    ) as AiAuditObservationLearningService;
    (svc as any).findSimilar = jest.fn(async () => [
      {
        similarity: 0.8,
        remark: {
          id: 'r1',
          clientId: 'client-b',
          rawFinding: 'Muster roll at Plant 2 missing for Ravi and Lakshmi',
          createdBy: 'auditor-1',
          approvedBy: 'crm-1',
          observationTitle: 'Muster roll not maintained',
          observationText: 'Form XII not maintained as required.',
        },
      },
    ]);
    const { matches } = await svc.search({
      findingDescription: 'muster roll',
    } as never);
    expect(matches[0].similarity).toBe(0.8);
    expect(matches[0].remark).toEqual({
      id: 'r1',
      observationTitle: 'Muster roll not maintained',
      observationText: 'Form XII not maintained as required.',
    });
  });
});
