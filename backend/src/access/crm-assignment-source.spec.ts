import { AccessScopeService } from './access-scope.service';

/**
 * CRM and auditor scope comes from the current-assignment table.
 *
 * AssignmentsService.changeAssignment() and the automatic rotation write
 * client_assignments_current and the history table. Nothing in the application
 * writes the legacy client_assignments table and no trigger syncs them, so
 * resolving scope from it answered with whoever was assigned whenever that
 * table was last populated — the newly assigned CRM denied, the former
 * assignee still admitted.
 *
 * This is the same query UsersService.getAssignedClientIds() runs, which is
 * what JwtStrategy already puts on the token.
 */
describe('getScope — CRM and auditor assignment source', () => {
  function makeService(rows: Array<{ client_id: string }>) {
    const query = jest.fn().mockResolvedValue(rows);
    const find = jest.fn().mockResolvedValue([{ clientId: 'legacy-client' }]);
    const svc = new AccessScopeService(
      { manager: { query }, find } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { svc, query, find };
  }

  const user = (roleCode: string) =>
    ({ id: 'u1', userId: 'u1', roleCode, clientId: null }) as any;

  it.each(['CRM', 'AUDITOR', 'PAYDEK'])(
    'resolves %s scope from client_assignments_current',
    async (roleCode) => {
      const { svc, query, find } = makeService([{ client_id: 'client-a' }]);

      await expect(svc.getScope(user(roleCode))).resolves.toEqual({
        level: 'clients',
        clientIds: ['client-a'],
      });

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('client_assignments_current'),
        ['u1'],
      );
      // The legacy table is not consulted at all.
      expect(find).not.toHaveBeenCalled();
    },
  );

  it('does not read the legacy client_assignments table', async () => {
    const { svc, query } = makeService([]);

    await svc.getScope(user('CRM'));

    const sql = query.mock.calls[0][0] as string;
    expect(sql).not.toMatch(/FROM client_assignments\s/);
  });

  it('resolves to nothing when the user holds no current assignment', async () => {
    // applyToQb and listAllowedClients both answer empty for an empty list, so
    // a CRM whose assignment was rotated away loses access rather than keeping
    // it.
    const { svc } = makeService([]);

    await expect(svc.getScope(user('CRM'))).resolves.toEqual({
      level: 'clients',
      clientIds: [],
    });
  });

  it('reflects a reassignment immediately', async () => {
    // The point of the fix, stated as behaviour: whatever the current table
    // says now is what the scope is now.
    const { svc } = makeService([{ client_id: 'newly-assigned' }]);

    const scope = await svc.getScope(user('CRM'));

    expect(scope.clientIds).toEqual(['newly-assigned']);
    expect(scope.clientIds).not.toContain('legacy-client');
  });
});
