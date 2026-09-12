import { AutomationGapReviewService } from './automation-gap-review.service';
describe('Scheduled AI gap guidance', () => {
  const row = {
    id: 'task1',
    title: 'Private employee title',
    status: 'OPEN',
    client_id: 'client1',
    branch_id: 'branch1',
    due_date: '2026-09-01',
  };
  it('scopes the query and supplies useful guidance when AI is unavailable', async () => {
    const query = jest.fn().mockResolvedValue([row]);
    const service = new AutomationGapReviewService(
      { query } as any,
      { isReady: async () => false } as any,
    );
    const result = await service.review({
      clientId: 'client1',
      branchId: 'branch1',
    });
    expect(query.mock.calls[0][1]).toEqual(['client1', 'branch1']);
    expect(result.mode).toBe('RULES');
    expect(result.actions[0].nextAction).toContain('assigned owner');
  });
  it('uses only matching identifiers and excludes private titles from the provider request', async () => {
    const complete = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        actions: [
          { id: 'foreign', explanation: 'Wrong', nextAction: 'Wrong' },
          {
            id: 'task1',
            explanation: 'This activity remains open.',
            nextAction: 'Review the evidence with its owner.',
          },
        ],
      }),
    });
    const service = new AutomationGapReviewService(
      { query: async () => [row] } as any,
      { isReady: async () => true, completeWithTracking: complete } as any,
    );
    const result = await service.review({ clientId: 'client1' }, 'admin1');
    expect(result.actions).toHaveLength(1);
    expect(result.mode).toBe('AI');
    expect(complete.mock.calls[0][1]).not.toContain(row.title);
    expect(complete.mock.calls[0][2]).toMatchObject({
      clientId: 'client1',
      userId: 'admin1',
    });
  });
  it.each([
    'not json',
    '{}',
    '{"actions":[{"id":"task1","explanation":null}]}',
  ])(
    'retains factual fallback for invalid provider response %s',
    async (content) => {
      const service = new AutomationGapReviewService(
        { query: async () => [row] } as any,
        {
          isReady: async () => true,
          completeWithTracking: async () => ({ content }),
        } as any,
      );
      expect((await service.review({})).mode).toBe('RULES');
    },
  );
});
