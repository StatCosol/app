import { AuditOutputEngineService } from './audit-output-engine.service';
import { generateAuditReportPdfBuffer } from '../../audits/utils/report-pdf';
import {
  actualAuditSql,
  isTestAudit,
  LEGACY_TEST_AUDIT_CODES,
} from '../../common/actual-records';

jest.mock('../../audits/utils/report-pdf', () => ({
  generateAuditReportPdfBuffer: jest.fn(),
}));

describe('Audit output follow-up integrity', () => {
  const pdf = jest.mocked(generateAuditReportPdfBuffer);
  function setup(
    report: any = { version_no: 3, selected_observation_ids: [] },
  ) {
    const query = jest
      .fn()
      .mockResolvedValueOnce(report ? [report] : [])
      .mockResolvedValue([]);
    const notify = { sendAuditReportReady: jest.fn() };
    const repo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'uuid-audit',
        auditCode: 'AUD-1',
        clientId: 'client',
      }),
    };
    const service = new AuditOutputEngineService(
      repo as any,
      {} as any,
      {} as any,
      {} as any,
      notify as any,
      { query } as any,
    );
    return { query, service, notify, repo };
  }
  beforeEach(() => {
    pdf.mockReset();
    pdf.mockResolvedValue(Buffer.from('pdf'));
  });
  it('reads the actual report version without attempting a UUID-to-bigint cast', async () => {
    const h = setup();
    expect((await h.service.generateReportVersion('uuid-audit')).version).toBe(
      3,
    );
    expect(h.query.mock.calls[0][0]).toContain('ar.version_no');
    expect(h.query.mock.calls.map(([sql]) => sql).join(' ')).not.toContain(
      '::bigint',
    );
  });
  it('propagates PDF failure to the correction follow-up warning handler', async () => {
    const h = setup();
    pdf.mockRejectedValue(new Error('PDF unavailable'));
    await expect(h.service.generateReportVersion('uuid-audit')).rejects.toThrow(
      'PDF unavailable',
    );
  });
  it('does not announce a ready report when no report exists', async () => {
    const h = setup(null);
    jest
      .spyOn(h.service, 'calculateAuditScore')
      .mockResolvedValue({ blendedScore: 100 } as any);
    const publish = jest.spyOn(h.service, 'publishToCrmAndClient');
    expect(
      (await h.service.refreshAuditOutputs('uuid-audit')).report.pdfBuffer,
    ).toBeNull();
    expect(publish).not.toHaveBeenCalled();
    expect(h.notify.sendAuditReportReady).not.toHaveBeenCalled();
  });
  it.each(['DRAFT', 'SUBMITTED', 'APPROVED'])(
    'does not notify clients about an unpublished %s report',
    async (status) => {
      const h = setup({ version_no: 1, status });
      jest
        .spyOn(h.service, 'calculateAuditScore')
        .mockResolvedValue({ blendedScore: 100 } as any);
      const publish = jest.spyOn(h.service, 'publishToCrmAndClient');
      await h.service.refreshAuditOutputs('uuid-audit');
      expect(publish).not.toHaveBeenCalled();
      expect(h.notify.sendAuditReportReady).not.toHaveBeenCalled();
    },
  );
  it('only announces a successfully rendered, published, unheld report', async () => {
    const h = setup({ version_no: 1, status: 'PUBLISHED', held_at: null });
    jest
      .spyOn(h.service, 'calculateAuditScore')
      .mockResolvedValue({ blendedScore: 100 } as any);
    const publish = jest
      .spyOn(h.service, 'publishToCrmAndClient')
      .mockResolvedValue();
    await h.service.refreshAuditOutputs('uuid-audit');
    expect(publish).toHaveBeenCalledWith('uuid-audit');
    expect(h.notify.sendAuditReportReady).toHaveBeenCalledTimes(1);
  });

  it.each([
    { notes: 'TEST ONLY live workflow' },
    { notes: 'synthetic test only_fixture' },
    {
      branchId: '94ad1c42-ea05-460e-b494-0a7e634de127',
      auditCode: LEGACY_TEST_AUDIT_CODES[0],
    },
  ])(
    'never creates client tickets or ready notifications for a synthetic audit %j',
    async (fixture) => {
      const h = setup({ version_no: 1, status: 'PUBLISHED', held_at: null });
      h.repo.findOne.mockResolvedValue({
        id: 'uuid-audit',
        clientId: 'client',
        auditCode: 'AUD-1',
        ...fixture,
      } as any);
      jest
        .spyOn(h.service, 'calculateAuditScore')
        .mockResolvedValue({ blendedScore: 100 } as any);
      const queryCount = h.query.mock.calls.length;
      await h.service.publishToCrmAndClient('uuid-audit');
      expect(h.query).toHaveBeenCalledTimes(queryCount);
      await h.service.refreshAuditOutputs('uuid-audit');
      expect(h.notify.sendAuditReportReady).not.toHaveBeenCalled();
    },
  );

  it('does not classify actual future periods or incidental review wording as test data', () => {
    expect(
      isTestAudit({
        notes: 'Review the test equipment',
        auditCode: 'AUD-2099',
      }),
    ).toBe(false);
    expect(
      isTestAudit({
        branchId: 'another-branch',
        auditCode: LEGACY_TEST_AUDIT_CODES[0],
      }),
    ).toBe(false);
  });

  it('excludes fixtures from Client and CRM summary aggregates while retaining assignment scopes', async () => {
    const h = setup(null);
    await h.service.getClientAuditSummaries('client', ['branch']);
    expect(h.query).toHaveBeenLastCalledWith(
      expect.stringContaining(`a.client_id = $1 AND ${actualAuditSql('a')}`),
      ['client', ['branch']],
    );
    expect(h.query.mock.calls.at(-1)![0]).toContain(
      'a.branch_id = ANY($2::uuid[])',
    );
    await h.service.getCrmAuditSummaries('crm-user');
    expect(h.query).toHaveBeenLastCalledWith(
      expect.stringContaining(`a.client_id = c.id AND ${actualAuditSql('a')}`),
      ['crm-user'],
    );
    expect(h.query.mock.calls.at(-1)![0]).toContain(
      "cac.assignment_type = 'CRM'",
    );
  });
});
