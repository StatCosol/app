import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ComplianceReuploadService } from './compliance-reupload.service';
import { CompliancePortalTasksService } from './compliance-portal-tasks.service';
import { ComplianceService } from './compliance.service';

/**
 * Re-upload and contractor task workflows: who may act on a request, which
 * status transitions are allowed, and that a rejection reopens the loop.
 */

function memoryRepo(rows: any[] = []) {
  const matches = (row: any, where: any = {}) =>
    Object.entries(where).every(([k, v]) => String(row[k]) === String(v));
  return {
    rows,
    findOne: jest.fn(
      async (o: any) => rows.find((r) => matches(r, o?.where)) ?? null,
    ),
    count: jest.fn(
      async (o: any) => rows.filter((r) => matches(r, o?.where)).length,
    ),
    create: jest.fn((v: any) => ({ ...v })),
    save: jest.fn(async (v: any) => {
      if (!v.id) v.id = `id-${rows.length + 1}`;
      const i = rows.findIndex((r) => r.id === v.id);
      if (i >= 0) rows[i] = v;
      else rows.push(v);
      return v;
    }),
    update: jest.fn(async (where: any, patch: any) => {
      rows
        .filter((r) => matches(r, where))
        .forEach((r) => Object.assign(r, patch));
    }),
  };
}

const file = {
  path: 'uploads\\evidence\\new.pdf',
  originalname: 'new.pdf',
  mimetype: 'application/pdf',
  size: 1234,
} as Express.Multer.File;

describe('ComplianceReuploadService', () => {
  function setup(
    seed: {
      requests?: any[];
      evidence?: any[];
      tasks?: any[];
      auditorClients?: string[];
    } = {},
  ) {
    const tasks = memoryRepo(seed.tasks ?? []);
    const evidence = memoryRepo(seed.evidence ?? [{ id: 11, taskId: 5 }]);
    const requests = memoryRepo(seed.requests ?? []);
    const versions = memoryRepo();
    const users = memoryRepo([
      { id: 'aud-1', email: 'aud@example.test' },
      { id: 'con-1', email: 'con@example.test' },
    ]);
    const assignments = {
      getAssignedClientsForAuditor: jest.fn(async () =>
        (seed.auditorClients ?? ['client-1']).map((id) => ({ id })),
      ),
      getAssignedClientsForCrm: jest.fn(async () => []),
    };
    const notifications = { createTicket: jest.fn(async () => undefined) };
    const email = { send: jest.fn(async () => undefined) };
    const service = new ComplianceReuploadService(
      tasks as any,
      evidence as any,
      memoryRepo() as any,
      requests as any,
      versions as any,
      users as any,
      memoryRepo() as any,
      assignments as any,
      notifications as any,
      email as any,
      { invalidateBranch: jest.fn() } as any,
    );
    return {
      service,
      tasks,
      evidence,
      requests,
      versions,
      notifications,
      email,
    };
  }

  const clientUser = {
    roleCode: 'CLIENT',
    clientId: 'client-1',
    userId: 'client-u',
  } as any;
  const auditor = { roleCode: 'AUDITOR', userId: 'aud-1' } as any;
  const openClientRequest = () => ({
    id: 'r1',
    status: 'OPEN',
    targetRole: 'CLIENT',
    clientId: 'client-1',
    documentId: 11,
    requestedByUserId: 'aud-1',
    contractorUserId: 'con-1',
  });

  describe('client re-upload', () => {
    it('only the target company can upload to a request', async () => {
      const { service } = setup({
        requests: [{ ...openClientRequest(), clientId: 'client-2' }],
      });
      await expect(
        service.clientReuploadFile(
          { ...clientUser, roleCode: 'CONTRACTOR' },
          'r1',
          file,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.clientReuploadFile(
          { ...clientUser, clientId: null },
          'r1',
          file,
        ),
      ).rejects.toThrow('missing clientId');
      await expect(
        service.clientReuploadFile(clientUser, 'r1', file),
      ).rejects.toThrow('Not your request');
      await expect(
        service.clientReuploadFile(clientUser, 'nope', file),
      ).rejects.toThrow(NotFoundException);
    });

    it('stores a new version with a normalised path', async () => {
      const { service, versions, evidence } = setup({
        requests: [openClientRequest()],
        evidence: [{ id: 11, taskId: 5, filePath: 'old.pdf' }],
      });
      await service.clientReuploadFile(clientUser, 'r1', file);
      await service.clientReuploadFile(clientUser, 'r1', file);
      expect(versions.rows.map((v) => v.versionNo)).toEqual([1, 2]);
      expect(versions.rows[0]).toMatchObject({
        filePath: 'uploads/evidence/new.pdf',
        uploadedByRole: 'CLIENT',
        reuploadRequestId: 'r1',
      });
      expect(evidence.rows[0].filePath).toBe('uploads/evidence/new.pdf');
    });

    it('cannot submit before uploading, or twice', async () => {
      const { service, requests, email } = setup({
        requests: [openClientRequest()],
      });
      await expect(
        service.clientSubmitReupload(clientUser, 'r1'),
      ).rejects.toThrow('upload file before submitting');
      await service.clientReuploadFile(clientUser, 'r1', file);
      await expect(
        service.clientSubmitReupload(clientUser, 'r1'),
      ).resolves.toMatchObject({ status: 'SUBMITTED' });
      expect(requests.rows[0].submittedAt).toBeInstanceOf(Date);
      expect(email.send).toHaveBeenCalledWith(
        'aud@example.test',
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
      await expect(
        service.clientSubmitReupload(clientUser, 'r1'),
      ).rejects.toThrow('Request is not open');
    });
  });

  describe('auditor review', () => {
    const submitted = () => ({ ...openClientRequest(), status: 'SUBMITTED' });

    it('only an auditor assigned to the company may review', async () => {
      const { service } = setup({
        requests: [submitted()],
        auditorClients: ['other'],
      });
      await expect(
        service.auditorApproveReupload(clientUser, 'r1'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.auditorApproveReupload(auditor, 'r1'),
      ).rejects.toThrow('not assigned to this auditor');
      await expect(
        service.auditorRejectReupload(auditor, 'r1', 'bad'),
      ).rejects.toThrow('not assigned to this auditor');
    });

    it('approves only SUBMITTED requests', async () => {
      const { service, requests } = setup({ requests: [openClientRequest()] });
      await expect(
        service.auditorApproveReupload(auditor, 'r1'),
      ).rejects.toThrow('Only SUBMITTED');
      requests.rows[0].status = 'SUBMITTED';
      await service.auditorApproveReupload(auditor, 'r1');
      expect(requests.rows[0]).toMatchObject({
        status: 'REVERIFIED',
        reverifiedByUserId: 'aud-1',
        crmRemarks: 'Approved by auditor',
      });
    });

    it('rejection needs remarks and reopens a fresh 7-day request', async () => {
      const { service, requests } = setup({ requests: [submitted()] });
      await expect(
        service.auditorRejectReupload(auditor, 'r1', '  '),
      ).rejects.toThrow('Remarks are required');
      const before = Date.now();
      const res = await service.auditorRejectReupload(
        auditor,
        'r1',
        ' Blurry scan ',
      );
      expect(requests.rows[0]).toMatchObject({
        status: 'REJECTED',
        crmRemarks: 'Blurry scan',
      });
      const reopened = requests.rows.find((r) => r.id === res.newRequestId);
      expect(reopened).toMatchObject({
        status: 'OPEN',
        targetRole: 'CLIENT',
        clientId: 'client-1',
        documentId: 11,
        reason: 'Blurry scan',
      });
      const days = (reopened.deadlineDate.getTime() - before) / 86_400_000;
      expect(Math.round(days)).toBe(7);
    });
  });

  describe('auditor raising re-upload requests', () => {
    it('rejects evidence that is not on the task', async () => {
      const { service } = setup({ tasks: [{ id: 5, clientId: 'client-1' }] });
      await expect(
        service.createReuploadRequestsFromAuditor(auditor, {
          taskId: '5',
          items: [{ docId: '99', remarks: 'x' }],
        }),
      ).rejects.toThrow('Evidence #99 not found for task #5');
    });

    it('creates one contractor request per document', async () => {
      const { service, requests } = setup({
        tasks: [
          {
            id: 5,
            clientId: 'client-1',
            branchId: 'b1',
            assignedToUserId: 'con-1',
          },
        ],
        evidence: [
          { id: 11, taskId: 5 },
          { id: 12, taskId: 5 },
        ],
      });
      const res = await service.createReuploadRequestsFromAuditor(auditor, {
        taskId: '5',
        items: [
          { docId: '11', remarks: 'wrong month' },
          { docId: '12', remarks: 'unsigned' },
        ],
      });
      expect(res.created).toBe(2);
      expect(
        requests.rows.map((r) => [
          r.documentId,
          r.targetRole,
          r.contractorUserId,
          r.unitId,
        ]),
      ).toEqual([
        [11, 'CONTRACTOR', 'con-1', 'b1'],
        [12, 'CONTRACTOR', 'con-1', 'b1'],
      ]);
    });

    // KNOWN BUG: items are saved one by one, so when a later document is
    // invalid the call fails but the earlier requests have already been
    // created (and the auditor sees an error). Remove `.failing` once the
    // batch is validated up front or run in a transaction.
    it.failing(
      'creates nothing when any document in the batch is invalid',
      async () => {
        const { service, requests } = setup({
          tasks: [{ id: 5, clientId: 'client-1' }],
        });
        await expect(
          service.createReuploadRequestsFromAuditor(auditor, {
            taskId: '5',
            items: [
              { docId: '11', remarks: 'ok' },
              { docId: '99', remarks: 'bad' },
            ],
          }),
        ).rejects.toThrow(BadRequestException);
        expect(requests.rows).toHaveLength(0);
      },
    );
  });
});

describe('CompliancePortalTasksService contractor transitions', () => {
  function setup(
    task: any,
    opts: { evidenceCount?: number; branchIds?: string[]; role?: string } = {},
  ) {
    const tasks = memoryRepo([task]);
    const users = {
      findOne: jest.fn(async (o: any) =>
        o.where.id === 'con-1'
          ? {
              id: 'con-1',
              clientId: 'client-1',
              branches: (opts.branchIds ?? ['b1']).map((id) => ({ id })),
            }
          : { id: o.where.id, email: 'crm@example.test' },
      ),
    };
    const evidence = { count: jest.fn(async () => opts.evidenceCount ?? 1) };
    const email = { sendAuditMail: jest.fn(async () => undefined) };
    const service = new CompliancePortalTasksService(
      {} as any,
      tasks as any,
      {} as any,
      evidence as any,
      {} as any,
      users as any,
      {} as any,
      {} as any,
      {
        getUserRoleCode: jest.fn(async () => opts.role ?? 'CONTRACTOR'),
      } as any,
      { createTicket: jest.fn(async () => undefined) } as any,
      email as any,
      { invalidateBranch: jest.fn(async () => undefined) } as any,
    );
    return { service, tasks, email };
  }
  const contractor = { roleCode: 'CONTRACTOR', userId: 'con-1' } as any;
  const base = {
    id: 1,
    clientId: 'client-1',
    branchId: 'b1',
    assignedToUserId: null,
    status: 'PENDING',
  };

  it('blocks other companies, other branches and other contractors', async () => {
    await expect(
      setup({ ...base, clientId: 'client-2' }).service.contractorSetInProgress(
        contractor,
        '1',
      ),
    ).rejects.toThrow('Not your client');
    await expect(
      setup({ ...base, branchId: 'b9' }).service.contractorSetInProgress(
        contractor,
        '1',
      ),
    ).rejects.toThrow('Not your branch');
    await expect(
      setup({
        ...base,
        assignedToUserId: 'con-2',
      }).service.contractorSetInProgress(contractor, '1'),
    ).rejects.toThrow('another contractor');
    await expect(
      setup(base, { role: 'CLIENT' }).service.contractorSetInProgress(
        contractor,
        '1',
      ),
    ).rejects.toThrow('Contractor only');
  });

  it('claims an unassigned task and starts it', async () => {
    const { service, tasks } = setup(base);
    await expect(
      service.contractorSetInProgress(contractor, '1'),
    ).resolves.toEqual({ status: 'IN_PROGRESS' });
    expect(tasks.rows[0]).toMatchObject({
      assignedToUserId: 'con-1',
      status: 'IN_PROGRESS',
    });
  });

  it.each(['SUBMITTED', 'APPROVED'])(
    'cannot restart a %s task',
    async (status) => {
      const { service } = setup({ ...base, assignedToUserId: 'con-1', status });
      await expect(
        service.contractorSetInProgress(contractor, '1'),
      ).rejects.toThrow('Cannot start this task');
    },
  );

  // KNOWN BUG: the task is claimed before the status check, so a contractor
  // who tries to start an already-approved, unassigned task becomes its
  // assignee even though the call fails. Remove `.failing` once fixed.
  it.failing('does not claim a task it refuses to start', async () => {
    const { service, tasks } = setup({ ...base, status: 'APPROVED' });
    await expect(
      service.contractorSetInProgress(contractor, '1'),
    ).rejects.toThrow('Cannot start this task');
    expect(tasks.rows[0].assignedToUserId).toBeNull();
  });

  it('requires evidence before submitting', async () => {
    const { service } = setup(
      { ...base, assignedToUserId: 'con-1', status: 'IN_PROGRESS' },
      { evidenceCount: 0 },
    );
    await expect(service.contractorSubmit(contractor, '1')).rejects.toThrow(
      'Upload evidence before submitting',
    );
  });

  it('submits and emails the CRM who assigned it', async () => {
    const { service, tasks, email } = setup({
      ...base,
      assignedToUserId: 'con-1',
      status: 'REJECTED',
      assignedByUserId: 'crm-1',
    });
    await expect(service.contractorSubmit(contractor, '1')).resolves.toEqual({
      status: 'SUBMITTED',
    });
    expect(tasks.rows[0].status).toBe('SUBMITTED');
    expect(email.sendAuditMail).toHaveBeenCalledWith(
      'crm@example.test',
      'Task Submitted #1',
      expect.any(String),
      expect.any(String),
    );
  });

  it('cannot resubmit an approved task', async () => {
    const { service } = setup({
      ...base,
      assignedToUserId: 'con-1',
      status: 'APPROVED',
    });
    await expect(service.contractorSubmit(contractor, '1')).rejects.toThrow(
      'Cannot submit from current status',
    );
  });
});

describe('ComplianceService facade', () => {
  it('lists the compliance master for ADMIN only', async () => {
    const masters = { find: jest.fn(async () => [{ id: 'm' }]) };
    const service = new (ComplianceService as any)(
      masters,
      ...Array(17).fill({}),
    );
    await expect(
      service.listComplianceMaster({ roleCode: 'CRM' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.listComplianceMaster({ roleCode: 'ADMIN' }),
    ).resolves.toEqual([{ id: 'm' }]);
    expect(masters.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { complianceName: 'ASC' },
    });
  });

  it('delegates every portal call to the owning service with the same arguments', async () => {
    const spy = () => {
      const fns: Record<string, jest.Mock> = {};
      return new Proxy(fns, {
        get: (_t, name: string) =>
          (fns[name] ??= jest.fn(async (...args: any[]) => ({ name, args }))),
      });
    };
    const reupload: any = spy();
    const dashboard: any = spy();
    const crm: any = spy();
    const portal: any = spy();
    const service: any = new (ComplianceService as any)(
      ...Array(15).fill({}),
      reupload,
      dashboard,
      crm,
      portal,
    );
    const owners: Record<string, any> = {
      crmDashboard: dashboard,
      contractorDashboard: dashboard,
      clientDashboard: dashboard,
      adminDashboard: dashboard,
      auditorDashboard: dashboard,
      crmTaskKpis: crm,
      crmBulkApprove: crm,
      crmBulkReject: crm,
      crmCreateTask: crm,
      crmListTasks: crm,
      crmGetTaskDetail: crm,
      crmAssignTask: crm,
      crmApprove: crm,
      crmReject: crm,
      contractorListTasks: portal,
      contractorGetTaskDetail: portal,
      contractorAddComment: portal,
      contractorSetInProgress: portal,
      contractorSubmit: portal,
      contractorMarkNotApplicable: portal,
      contractorUploadEvidence: portal,
      auditorListTasks: portal,
      auditorGetTaskDetail: portal,
      auditorShareReport: portal,
      clientListTasks: portal,
      autoGenerateMonthlyTasks: portal,
      clientListMcdItems: portal,
      clientUploadEvidence: portal,
      clientSubmitTask: portal,
      adminListTasks: portal,
      auditorListDocs: portal,
      auditorAddRemark: portal,
      clientListReuploadRequests: reupload,
      clientReuploadFile: reupload,
      clientSubmitReupload: reupload,
      branchListReuploadRequests: reupload,
      branchReuploadFile: reupload,
      branchSubmitReupload: reupload,
      branchMarkReuploadNotApplicable: reupload,
      contractorListReuploadRequests: reupload,
      contractorReuploadFile: reupload,
      contractorSubmitReupload: reupload,
      contractorGetDocRemarks: reupload,
      createReuploadRequestsFromAuditor: reupload,
      auditorListReuploadRequests: reupload,
      auditorApproveReupload: reupload,
      auditorRejectReupload: reupload,
      crmListReuploadRequests: reupload,
      crmTopOverdueReuploadUnits: reupload,
    };
    for (const [method, owner] of Object.entries(owners)) {
      const args = ['a', 'b', 'c', 'd', 'e'];
      const res = await service[method](...args);
      expect(res.name).toBe(method);
      expect(owner[method]).toHaveBeenCalled();
      expect(res.args).toEqual(args.slice(0, res.args.length));
    }
  });
});
