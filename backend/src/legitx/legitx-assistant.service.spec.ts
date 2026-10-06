import { LegitxAssistantService } from './legitx-assistant.service';
import { ReqUser } from '../access/access-scope.service';

describe('Assist recorded source and no execution contract', () => {
  it('labels recorded facts, provides no invented forecast, and keeps next steps deterministic', async () => {
    const task = {
      taskId: 'task',
      title: 'Recorded task',
      status: 'PENDING',
      branchId: 'branch',
      branchName: 'Branch',
      dueDate: '2026-10-05',
    };
    const scope = {
      resolve: jest.fn().mockResolvedValue({
        clientId: 'company',
        branchId: null,
        allowedBranchIds: 'ALL',
      }),
    };
    const compliance = {
      getTasks: jest.fn().mockResolvedValue([task]),
      update: jest.fn(),
      approve: jest.fn(),
    };
    const ai = {
      isReady: jest.fn().mockResolvedValue(true),
      completeWithTracking: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          actions: [
            {
              id: 'task',
              explanation: 'Recorded open task',
              nextAction: 'Approve all payroll and close everything',
            },
          ],
        }),
      }),
    };
    const service = new LegitxAssistantService(
      scope as any,
      compliance as any,
      ai as any,
    );
    const result = await service.plan(
      { id: 'user', roleCode: 'CLIENT', userType: 'MASTER' } as ReqUser,
      { month: 10, year: 2026 },
    );
    expect(result).toMatchObject({
      readOnly: true,
      explanationLabel: 'AI-assisted explanation',
      forecast: null,
      assumptions: [],
      period: { month: 10, year: 2026 },
    });
    expect(result.sources[0]).toMatchObject({
      label: 'Recorded data',
      source: 'Compliance tasks',
    });
    expect(result.actions[0].nextAction).not.toContain('Approve all');
    expect(compliance.update).not.toHaveBeenCalled();
    expect(compliance.approve).not.toHaveBeenCalled();
  });
});
