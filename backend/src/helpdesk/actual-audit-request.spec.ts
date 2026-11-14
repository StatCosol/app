import { actualAuditRequestSql } from './actual-audit-request';
import {
  actualAuditObservationSql,
  actualAuditSql,
} from '../common/actual-records';
import { HelpdeskService } from './helpdesk.service';

describe('CRM operational audit-request isolation', () => {
  it('uses the linked observation and audit within the ticket tenant/branch', () => {
    const sql = actualAuditRequestSql();
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain("t.category = 'AUDIT'");
    expect(sql).toContain("t.sub_category = 'AUDIT_OBSERVATION_CLOSURE'");
    expect(sql).toContain('request_audit.client_id = t.client_id');
    expect(sql).toContain('request_audit.branch_id = t.branch_id');
    expect(sql).toContain(actualAuditSql('request_audit'));
    expect(sql).toContain(actualAuditObservationSql('request_observation'));
    expect(sql).not.toContain('description::uuid');
    expect(sql).not.toContain('period_year');
    expect(sql).not.toContain('description ILIKE');
  });

  it('filters both CRM list entry points without changing detail access or records', async () => {
    const ticket = { id: 'fixture-ticket', clientId: 'assigned-client' };
    const qb: any = { getMany: jest.fn().mockResolvedValue([]) };
    for (const name of ['where', 'andWhere', 'orderBy'])
      qb[name] = jest.fn().mockReturnValue(qb);
    const repo = {
      createQueryBuilder: jest.fn(() => qb),
      findOne: jest.fn().mockResolvedValue(ticket),
      update: jest.fn(),
      save: jest.fn(),
    };
    const service = new HelpdeskService(
      repo as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest
      .spyOn(service as any, 'crmAssignedClientIds')
      .mockResolvedValue(['assigned-client']);
    const user = { id: 'crm', roleCode: 'CRM' } as any;
    const query = {
      status: 'OPEN',
      clientId: 'assigned-client',
      category: 'AUDIT',
    };
    await service.crmListTickets(user, query);
    await service.listTickets(user, query);
    expect(qb.where).toHaveBeenCalledWith('t.client_id IN (:...ids)', {
      ids: ['assigned-client'],
    });
    expect(
      qb.andWhere.mock.calls.filter(([sql]) => sql === actualAuditRequestSql()),
    ).toHaveLength(2);
    expect(qb.andWhere).toHaveBeenCalledWith('t.status = :s', { s: 'OPEN' });
    expect(qb.andWhere).toHaveBeenCalledWith('t.client_id = :c', {
      c: 'assigned-client',
    });
    await expect(service.getTicket(user, ticket.id)).resolves.toEqual(ticket);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('returns no records for an unassigned CRM before building a query', async () => {
    const repo = { createQueryBuilder: jest.fn() };
    const service = new HelpdeskService(
      repo as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(service as any, 'crmAssignedClientIds').mockResolvedValue([]);
    await expect(
      service.crmListTickets({ id: 'crm', roleCode: 'CRM' } as any, {}),
    ).resolves.toEqual([]);
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  });
});
