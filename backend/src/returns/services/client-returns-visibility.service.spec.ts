import { ForbiddenException } from '@nestjs/common';
import { ClientReturnsVisibilityService } from './client-returns-visibility.service';
import { ReqUser } from '../../access/access-scope.service';

/**
 * These endpoints took clientId from a URL parameter and branchId from the query
 * string with no user context at all. The role guard checked that the caller was
 * a CLIENT, never that they were *that* client — so the UUID in the path was the
 * only thing standing between one tenant and another's compliance records, and
 * omitting branchId widened a branch user to their whole client.
 *
 * Every test here is about what the caller may NOT see. A leak is silent: the
 * response looks perfectly normal, just with somebody else's rows in it.
 */
describe('ClientReturnsVisibilityService — scope enforcement', () => {
  const CLIENT = '11111111-1111-1111-1111-111111111111';
  const OTHER_CLIENT = '22222222-2222-2222-2222-222222222222';
  const BRANCH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const BRANCH_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const build = () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new ClientReturnsVisibilityService({ query } as never);
    return { service, query };
  };

  const user = (over: Partial<ReqUser> = {}): ReqUser =>
    ({ id: 'u1', roleCode: 'CLIENT', clientId: CLIENT, ...over }) as ReqUser;

  it('refuses to read another tenant, however the path is crafted', async () => {
    const { service, query } = build();
    await expect(
      service.getReturns(OTHER_CLIENT, undefined, user()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.getExpiry(OTHER_CLIENT, undefined, user()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it('confines a branch user to their branches when no branch is requested', async () => {
    const { service, query } = build();
    await service.getReturns(
      CLIENT,
      undefined,
      user({ branchIds: [BRANCH_A] }),
    );
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('branch_id = ANY($2)');
    expect(params[1]).toEqual([BRANCH_A]);
  });

  it('refuses a branch the user is not assigned to', async () => {
    const { service, query } = build();
    await expect(
      service.getReturns(CLIENT, BRANCH_B, user({ branchIds: [BRANCH_A] })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it('lets an explicit branch narrow, never widen', async () => {
    const { service, query } = build();
    await service.getReturns(
      CLIENT,
      BRANCH_A,
      user({ branchIds: [BRANCH_A, BRANCH_B] }),
    );
    expect(query.mock.calls[0][1][1]).toEqual([BRANCH_A]);
  });

  it('leaves a whole-client user unfiltered by branch', async () => {
    const { service, query } = build();
    await service.getReturns(CLIENT, undefined, user({ branchIds: [] }));
    expect(query.mock.calls[0][0]).not.toContain('branch_id = ANY');
  });

  it('lets an ADMIN read across tenants', async () => {
    const { service, query } = build();
    await service.getReturns(
      OTHER_CLIENT,
      undefined,
      user({ roleCode: 'ADMIN', clientId: CLIENT }),
    );
    expect(query).toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller rather than defaulting open', async () => {
    const { service } = build();
    await expect(
      service.getReturns(CLIENT, undefined, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('scopes the compliance summary the same way', async () => {
    const { service, query } = build();
    await service.getComplianceSummary(
      CLIENT,
      undefined,
      user({ branchIds: [BRANCH_A] }),
    );
    expect(query.mock.calls[0][0]).toContain('branch_id = ANY($2)');
    expect(query.mock.calls[0][1][1]).toEqual([BRANCH_A]);
  });
});
