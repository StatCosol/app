import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiRiskEngineService } from './ai-risk-engine.service';
import { AiPayrollAnomalyService } from './ai-payroll-anomaly.service';
import { ReqUser } from '../access/access-scope.service';

describe('AI operational ownership', () => {
  const user = { userId: 'cco', id: 'cco', roleCode: 'CCO' } as ReqUser;
  let access: any;
  let risk: any;
  let audit: any;
  let payroll: any;
  let docs: any;
  let controller: AiController;
  beforeEach(() => {
    access = {
      getCcoClientIds: jest.fn().mockResolvedValue(['assigned']),
      getScope: jest.fn().mockResolvedValue({ level: 'all' }),
      assertClientAllowed: jest.fn(),
      assertCcoClientAllowed: jest.fn(),
      assertBranchAllowed: jest.fn(),
      assertCcoBranchAllowed: jest.fn(),
      assertDocumentInScope: jest.fn(),
    };
    risk = {
      getHighRiskClients: jest.fn(),
      getPlatformRiskSummary: jest.fn(),
      getInsights: jest.fn(),
      getInsight: jest.fn().mockResolvedValue({ clientId: 'outside' }),
      dismissInsight: jest.fn(),
      runAssessment: jest.fn(),
      getLatestAssessment: jest.fn(),
      getAssessmentHistory: jest.fn(),
      runBranchAssessment: jest.fn(),
      getBranchRiskSnapshot: jest.fn(),
    };
    audit = {
      getObservation: jest.fn().mockResolvedValue({ clientId: 'outside' }),
      generateObservation: jest.fn(),
      listObservations: jest.fn(),
    };
    payroll = {
      getAnomaly: jest.fn().mockResolvedValue({ clientId: 'outside' }),
      resolveAnomaly: jest.fn(),
      detectAnomalies: jest.fn(),
      listAnomalies: jest.fn(),
      getAnomalySummary: jest.fn(),
    };
    docs = {
      documentOwner: jest.fn().mockResolvedValue({ clientId: 'outside' }),
      checkDocument: jest.fn(),
      listChecks: jest.fn(),
    };
    controller = new AiController(
      risk,
      audit,
      payroll,
      {} as any,
      {} as any,
      docs,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      access,
    );
  });

  it.each([{ clientIds: ['assigned'] }, { clientIds: [] }])(
    'intersects CCO lists and dashboard with current assignments %j',
    async ({ clientIds }) => {
      access.getCcoClientIds.mockResolvedValue(clientIds);
      await controller.getHighRiskClients(user);
      await controller.getPlatformRiskSummary(user);
      await controller.getAiDashboard(user);
      await controller.getInsights(user);
      await controller.listObservations(user);
      await controller.listDocumentChecks(user);
      expect(risk.getHighRiskClients).toHaveBeenCalledWith(
        20,
        false,
        clientIds,
      );
      expect(risk.getPlatformRiskSummary).toHaveBeenCalledWith(clientIds);
      expect(risk.getInsights).toHaveBeenCalledWith(undefined, 10, clientIds);
      expect(risk.getInsights).toHaveBeenCalledWith(undefined, 50, clientIds);
      expect(audit.listObservations).toHaveBeenCalledWith(
        expect.anything(),
        50,
        clientIds,
      );
      expect(docs.listChecks).toHaveBeenCalledWith(
        expect.objectContaining({ clientIds }),
      );
    },
  );

  it('keeps global administrator reporting', async () => {
    await controller.getAiDashboard({ ...user, roleCode: 'ADMIN' });
    expect(risk.getPlatformRiskSummary).toHaveBeenCalledWith(null);
  });

  it('denies out-of-scope reads, generation and mutations before downstream work', async () => {
    access.assertCcoClientAllowed.mockRejectedValue(new ForbiddenException());
    const requests = [
      () => controller.runRiskAssessment({ clientId: 'outside' } as any, user),
      () => controller.getClientRisk('outside', user),
      () => controller.getClientRiskHistory(user, 'outside'),
      () =>
        controller.generateAuditObservation(
          { clientId: 'outside' } as any,
          user,
        ),
      () => controller.getObservation(user, 'observation'),
      () => controller.detectPayrollAnomalies({ clientId: 'outside' }, user),
      () => controller.listAnomalies(user, 'outside'),
      () => controller.getAnomalySummary('outside', user),
      () => controller.dismissInsight('insight', user),
      () => controller.resolveAnomaly('anomaly', { status: 'RESOLVED' }, user),
      () => controller.runDocumentCheck('document', user),
    ];
    for (const request of requests)
      await expect(request()).rejects.toThrow(ForbiddenException);
    for (const fn of [
      risk.runAssessment,
      risk.getLatestAssessment,
      risk.getAssessmentHistory,
      risk.dismissInsight,
      audit.generateObservation,
      payroll.detectAnomalies,
      payroll.listAnomalies,
      payroll.getAnomalySummary,
      payroll.resolveAnomaly,
      docs.checkDocument,
    ])
      expect(fn).not.toHaveBeenCalled();
  });

  it('denies unassigned payroll users before resolving another company anomaly', async () => {
    access.assertDocumentInScope.mockRejectedValue(new ForbiddenException());
    await expect(
      controller.resolveAnomaly(
        'id',
        { status: 'RESOLVED' },
        { ...user, roleCode: 'PAYROLL' },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(payroll.resolveAnomaly).not.toHaveBeenCalled();
  });

  it('allows authorized record mutations', async () => {
    await controller.dismissInsight('id', user);
    await controller.resolveAnomaly('id', { status: 'RESOLVED' }, user);
    expect(risk.dismissInsight).toHaveBeenCalledWith('id', 'cco');
    expect(payroll.resolveAnomaly).toHaveBeenCalledWith(
      'id',
      'cco',
      'RESOLVED',
      undefined,
    );
  });

  it('reserves global insight mutation for platform roles', async () => {
    risk.getInsight.mockResolvedValue({ clientId: null });
    await expect(controller.dismissInsight('id', user)).rejects.toThrow(
      ForbiddenException,
    );
    await controller.dismissInsight('id', { ...user, roleCode: 'ADMIN' });
    expect(risk.dismissInsight).toHaveBeenCalledTimes(1);
  });

  it('checks CCO branch assignments before branch reads and assessment', async () => {
    access.assertCcoBranchAllowed.mockRejectedValue(new ForbiddenException());
    await expect(
      controller.runBranchRiskAssessment({ branchId: 'outside' } as any, user),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.getBranchRisk(user, 'outside', '2026', '9'),
    ).rejects.toThrow(ForbiddenException);
    expect(risk.runBranchAssessment).not.toHaveBeenCalled();
    expect(risk.getBranchRiskSnapshot).not.toHaveBeenCalled();
  });

  it('returns not-found for missing insight and anomaly records', async () => {
    const repo = { findOneBy: jest.fn().mockResolvedValue(null) };
    await expect(
      new AiRiskEngineService(
        {} as any,
        repo as any,
        {} as any,
        {} as any,
        {} as any,
      ).getInsight('missing'),
    ).rejects.toThrow(NotFoundException);
    await expect(
      new AiPayrollAnomalyService(repo as any, {} as any, {} as any).getAnomaly(
        'missing',
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
