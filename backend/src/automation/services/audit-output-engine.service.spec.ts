import { AuditOutputEngineService } from './audit-output-engine.service';
import { generateAuditReportPdfBuffer } from '../../audits/utils/report-pdf';

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
    return { query, service, notify };
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
});
