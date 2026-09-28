import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { OperationalScopeService } from '../access/operational-scope.service';
import { ServiceEntitlementsService } from '../service-entitlements/service-entitlements.service';
import { ServiceEntitlementsGuard } from '../service-entitlements/service-entitlements.guard';
import { ServiceModuleCode } from '../service-entitlements/service-entitlements.constants';
import { PdfReportController } from './pdf-report.controller';
import { PdfReportService } from './pdf-report.service';

describe('Branch PDF HTTP entitlements', () => {
  const clientId = '00000000-0000-4000-8000-000000000001';
  const branchId = '00000000-0000-4000-8000-000000000002';
  let app: INestApplication;
  let roleCode: string;
  let level: 'branches' | 'all' | 'client';
  let enabledModules: ServiceModuleCode[];
  let reportQuery: jest.Mock;
  let entitlementQuery: jest.Mock;
  let render: jest.Mock;

  beforeAll(async () => {
    reportQuery = jest.fn().mockResolvedValue([]);
    entitlementQuery = jest.fn();
    render = jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 fixture'));
    const entitlements = new ServiceEntitlementsService({
      query: entitlementQuery,
    } as unknown as DataSource);
    const module = await Test.createTestingModule({
      controllers: [PdfReportController],
      providers: [
        { provide: DataSource, useValue: { query: reportQuery } },
        {
          provide: PdfReportService,
          useValue: {
            complianceSummary: render,
            riskHeatmap: render,
            dtssReport: render,
          },
        },
        {
          provide: OperationalScopeService,
          useValue: {
            resolve: async () => ({ level, clientId, branchIds: [branchId] }),
          },
        },
        { provide: ServiceEntitlementsService, useValue: entitlements },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI });
    // Authentication is a fixture; exercise the actual entitlement guard,
    // controller and entitlement service through versioned HTTP routes.
    app.use((req, _res, next) => {
      req.user = {
        roleCode,
        clientId,
        userType: level === 'branches' ? 'BRANCH' : 'MASTER',
        branchIds: [branchId],
        enabledModules: ['EMPLOYEE_COMPLIANCE'],
      };
      next();
    });
    app.useGlobalGuards(new ServiceEntitlementsGuard(entitlements));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    roleCode = 'CLIENT';
    level = 'branches';
    enabledModules = ['EMPLOYEE_COMPLIANCE'];
    entitlementQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM client_service_packages')) {
        return [{ package_code: 'CUSTOM_SERVICES', approved_at: new Date() }];
      }
      if (sql.includes('FROM client_module_entitlements')) {
        return enabledModules.map((module_code) => ({ module_code }));
      }
      throw new Error('Unexpected entitlement query');
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  describe.each(['compliance', 'risk-heatmap', 'dtss'])(
    '%s endpoint',
    (endpoint) => {
      const url = `/api/v1/reports/pdf/${endpoint}/${clientId}?month=2026-09`;

      describe.each(['CLIENT', 'BRANCH_DESK'])('%s branch user', (role) => {
        beforeEach(() => {
          roleCode = role;
        });

        it.each<ServiceModuleCode[]>([
          ['CONTRACTOR_AUDIT'],
          ['CONTRACTOR_DOCUMENTS'],
          ['CONTRACTOR_AUDIT', 'CONTRACTOR_DOCUMENTS'],
          [],
        ])(
          'rejects direct GET without employee compliance (%j)',
          async (...modules) => {
            enabledModules = modules;
            const res = await request(app.getHttpServer()).get(url).expect(403);
            expect(res.body.message).toContain('employee compliance');
            expect(entitlementQuery).toHaveBeenCalledWith(
              expect.stringContaining('FROM client_module_entitlements'),
              [clientId],
            );
            expect(reportQuery).not.toHaveBeenCalled();
            expect(render).not.toHaveBeenCalled();
          },
        );

        it('allows employee compliance and retains branch-scoped output', async () => {
          const res = await request(app.getHttpServer()).get(url).expect(200);
          expect(res.headers['content-type']).toContain('application/pdf');
          if (endpoint === 'dtss') {
            expect(reportQuery).toHaveBeenLastCalledWith(
              expect.stringContaining('ct.branch_id = ANY($3::uuid[])'),
              [clientId, '2026-09', [branchId]],
            );
          } else {
            expect(render).toHaveBeenCalledWith(clientId, '2026-09', 'Client', [
              branchId,
            ]);
          }
        });

        it('rechecks current entitlements after revocation despite an old user snapshot', async () => {
          await request(app.getHttpServer()).get(url).expect(200);
          enabledModules = ['CONTRACTOR_AUDIT'];
          reportQuery.mockClear();
          render.mockClear();
          await request(app.getHttpServer()).get(url).expect(403);
          expect(reportQuery).not.toHaveBeenCalled();
          expect(render).not.toHaveBeenCalled();
        });

        it('does not render if the entitlement lookup fails', async () => {
          entitlementQuery.mockRejectedValueOnce(
            new Error('database unavailable'),
          );
          await request(app.getHttpServer()).get(url).expect(500);
          expect(reportQuery).not.toHaveBeenCalled();
          expect(render).not.toHaveBeenCalled();
        });
      });

      it.each(['ADMIN', 'CEO', 'CCO', 'CRM', 'CLIENT'])(
        'preserves non-branch %s reporting',
        async (role) => {
          roleCode = role;
          level = role === 'CLIENT' ? 'client' : 'all';
          enabledModules = [];
          await request(app.getHttpServer()).get(url).expect(200);
          expect(entitlementQuery).not.toHaveBeenCalled();
          expect(render).toHaveBeenCalledTimes(1);
        },
      );
    },
  );
});
