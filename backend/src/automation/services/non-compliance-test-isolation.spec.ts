import { NonComplianceEngineService } from './non-compliance-engine.service';
import {
  LEGACY_TEST_AUDIT_CODES,
  actualAuditSql,
} from '../../common/actual-records';

describe('synthetic correction follow-ups', () => {
  const audit = {
    id: 'audit',
    clientId: 'client',
    branchId: 'branch',
    notes: '',
    auditCode: 'ACTUAL-2099',
  };
  const nc = {
    id: 'nc',
    auditId: 'audit',
    documentName: 'Test certificate',
    requestedToRole: 'CONTRACTOR',
    requestedToUserId: 'vendor',
  };
  function build(auditOverrides = {}, ncOverrides = {}) {
    const ncRepo = {
      findOne: jest.fn().mockResolvedValue({ ...nc, ...ncOverrides }),
    };
    const auditRepo = {
      findOne: jest.fn().mockResolvedValue({ ...audit, ...auditOverrides }),
    };
    const tasks = { createAuditNcTask: jest.fn() };
    const query = jest.fn().mockResolvedValue([]);
    const service = new NonComplianceEngineService(
      ncRepo as any,
      auditRepo as any,
      tasks as any,
      {} as any,
      { query } as any,
    );
    return { service, tasks, query, ncRepo, auditRepo };
  }
  it.each([
    [{ notes: 'TEST ONLY isolated audit' }, {}],
    [{ notes: 'synthetic test only_fixture' }, {}],
    [
      {
        branchId: '94ad1c42-ea05-460e-b494-0a7e634de127',
        auditCode: LEGACY_TEST_AUDIT_CODES[0],
      },
      {},
    ],
    [{}, { documentName: 'TEST ONLY isolated evidence' }],
  ])('keeps synthetic NCs out of operational tasks %j %j', async (a, n) => {
    const h = build(a, n);
    await h.service.createTaskForNc('nc');
    expect(h.tasks.createAuditNcTask).not.toHaveBeenCalled();
  });
  it('retains real certificates and future-period audits', async () => {
    const h = build({ notes: 'Review test equipment at site' });
    await h.service.createTaskForNc('nc');
    expect(h.tasks.createAuditNcTask).toHaveBeenCalledWith(
      expect.objectContaining({ ncId: 'nc', assignedUserId: 'vendor' }),
      undefined,
    );
  });
  it('uses the transaction repositories before suppressing a test follow-up', async () => {
    const h = build({ notes: 'TEST ONLY audit' });
    const manager = {
      getRepository: jest
        .fn()
        .mockReturnValueOnce(h.ncRepo)
        .mockReturnValueOnce(h.auditRepo),
    };
    await h.service.createTaskForNc('nc', manager as any);
    expect(manager.getRepository).toHaveBeenCalledTimes(2);
    expect(h.tasks.createAuditNcTask).not.toHaveBeenCalled();
  });
  it('excludes synthetic audits and evidence from daily reminder selection', async () => {
    const h = build();
    await h.service.getOpenNcForDailyReminder();
    expect(h.query.mock.calls[0][0]).toContain(actualAuditSql('a'));
    expect(h.query.mock.calls[0][0]).toContain('nc.document_name');
  });
});
