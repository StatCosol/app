import * as ExcelJS from 'exceljs';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AdminMastersService } from './admin-masters.service';
import { AdminActionsService } from './admin-actions.service';
import { AdminApprovalsService } from './admin-approvals.service';
import { calcRotationDueOn } from './helpers/rotation';
import { Frequency } from '../common/enums';

function memoryRepo(rows: any[] = []) {
  return {
    rows,
    find: jest.fn(async () => rows),
    findOne: jest.fn(
      async (o: any) => rows.find((r) => r.id === o?.where?.id) ?? null,
    ),
    create: jest.fn((v: any) => ({ ...v })),
    save: jest.fn(async (v: any) => {
      for (const item of Array.isArray(v) ? v : [v]) {
        if (!item.id) item.id = `id-${rows.length + 1}`;
        const i = rows.findIndex((r) => r.id === item.id);
        if (i >= 0) rows[i] = item;
        else rows.push(item);
      }
      return v;
    }),
    delete: jest.fn(async (id: string) => {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows.splice(i, 1);
    }),
    count: jest.fn(
      async (o: any) => rows.filter((r) => r.status === o.where.status).length,
    ),
  };
}

async function workbook(rows: (string | number | null)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Masters');
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('AdminMastersService — compliance master', () => {
  const setup = (rows: any[] = []) => {
    const compliance = memoryRepo(rows);
    const categories = memoryRepo();
    return {
      service: new AdminMastersService(compliance as any, categories as any),
      compliance,
      categories,
    };
  };

  it('requires name, law and frequency', async () => {
    const { service } = setup();
    await expect(
      service.createComplianceMaster({ complianceName: 'X' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it.each([
    [{ code: ' pf & esi / ecr ' }, 'PF_AND_ESI_ECR'],
    [{ complianceName: 'Provident Fund remittance' }, 'PF_PAYMENT'],
    [{ complianceName: 'ESI challan' }, 'ESI_PAYMENT'],
    [{ complianceName: 'Professional Tax' }, 'PT_PAYMENT'],
    [{ complianceName: 'LWF half-yearly' }, 'LWF_PAYMENT'],
    [{ complianceName: 'GST return' }, 'GST_RETURN'],
    [{ complianceName: 'TDS quarterly' }, 'TDS_RETURN'],
    [{ complianceName: 'ROC annual filing' }, 'ROC_FILINGS'],
    [{ complianceName: 'MCD upload' }, 'MCD_UPLOAD'],
    [{ complianceName: 'Fire NOC renewal' }, 'FIRE_NOC_RENEWAL'],
  ])('derives a stable code from %j', async (input, code) => {
    const { service } = setup();
    const saved: any = await service.createComplianceMaster({
      complianceName: 'Name',
      lawName: 'Law',
      frequency: Frequency.MONTHLY,
      ...input,
    });
    expect(saved.code).toBe(code);
    expect(saved.isActive).toBe(true);
  });

  it('does not derive PF from words that merely contain the letters', async () => {
    const { service } = setup();
    const saved: any = await service.createComplianceMaster({
      complianceName: 'Pfizer plant licence',
      lawName: 'Factories Act',
      frequency: Frequency.YEARLY,
    });
    expect(saved.code).toBe('PFIZER_PLANT_LICENCE');
  });

  it('updates only provided fields and backfills a missing code', async () => {
    const { service } = setup([
      {
        id: 'm1',
        code: '',
        complianceName: 'Bonus return',
        lawName: 'Bonus Act',
        isActive: true,
      },
    ]);
    const saved: any = await service.updateComplianceMaster('m1', {
      stateScope: 'TS',
    });
    expect(saved).toMatchObject({
      code: 'BONUS_RETURN',
      stateScope: 'TS',
      lawName: 'Bonus Act',
    });
    await expect(service.updateComplianceMaster('missing', {})).rejects.toThrow(
      NotFoundException,
    );
  });

  it('delete is a soft deactivate, so existing tasks keep their master', async () => {
    const { service, compliance } = setup([{ id: 'm1', isActive: true }]);
    await service.deleteComplianceMaster('m1');
    expect(compliance.rows).toEqual([{ id: 'm1', isActive: false }]);
  });

  describe('bulk Excel import', () => {
    it('requires the three key columns', async () => {
      const { service } = setup();
      await expect(
        service.bulkCreateComplianceMasters(
          await workbook([['Compliance Name', 'Law Name']]),
        ),
      ).rejects.toThrow(/Frequency/);
    });

    it('imports valid rows, skips duplicates and reports row-level errors', async () => {
      const { service, compliance } = setup([
        { id: 'old', complianceName: 'Existing', lawName: 'Law A' },
      ]);
      const res = await service.bulkCreateComplianceMasters(
        await workbook([
          [
            'Compliance Name',
            'Law Name',
            'Frequency',
            'Status',
            'Min Headcount',
            'Max Headcount',
            'Law Family',
          ],
          [
            'PF ECR',
            'EPF Act',
            'monthly',
            'active',
            '20',
            'abc',
            'LABOUR_CODE',
          ],
          ['existing', 'law a', 'Yearly', null, null, null, null],
          [
            'ESI return',
            'ESI Act',
            'Half-Yearly',
            'inactive',
            null,
            null,
            null,
          ],
          [null, null, null, null, null, null, null],
          ['No law', null, 'Monthly', null, null, null, null],
          ['Bad freq', 'Law', 'Weekly', null, null, null, null],
          ['PF ECR', 'EPF Act', 'Monthly', null, null, null, null],
        ]),
      );
      expect(res).toEqual({
        inserted: 2,
        skipped: 2,
        errors: [
          { row: 6, reason: 'Missing Law Name' },
          {
            row: 7,
            reason: expect.stringContaining('Invalid Frequency "Weekly"'),
          },
        ],
      });
      const inserted = compliance.rows.slice(1);
      expect(inserted).toEqual([
        expect.objectContaining({
          complianceName: 'PF ECR',
          code: 'PF_PAYMENT',
          frequency: Frequency.MONTHLY,
          minHeadcount: 20,
          maxHeadcount: null,
          lawFamily: 'LABOUR_CODE',
          isActive: true,
        }),
        expect.objectContaining({
          complianceName: 'ESI return',
          frequency: Frequency.HALF_YEARLY,
          isActive: false,
        }),
      ]);
    });
  });

  it('manages audit observation categories', async () => {
    const { service, categories } = setup();
    await expect(service.createAuditCategory({ name: '' })).rejects.toThrow(
      BadRequestException,
    );
    const c: any = await service.createAuditCategory({ name: 'Wages' });
    await service.updateAuditCategory(c.id, { description: 'Pay issues' });
    expect(categories.rows[0]).toMatchObject({
      name: 'Wages',
      description: 'Pay issues',
    });
    await service.deleteAuditCategory(c.id);
    expect(categories.rows).toHaveLength(0);
    await expect(service.deleteAuditCategory(c.id)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('calcRotationDueOn', () => {
  it('rotates CRMs after 12 months and auditors after 4', () => {
    expect(calcRotationDueOn('CRM', '2026-01-15')).toBe('2027-01-15');
    expect(calcRotationDueOn('AUDITOR', '2026-01-15')).toBe('2026-05-15');
  });

  // KNOWN BUG: month arithmetic overflows at month end. An auditor assigned
  // on 31 Oct is due "31 Feb", which JavaScript rolls to 3 March.
  it.failing('keeps a month-end auditor rotation inside the due month', () => {
    expect(calcRotationDueOn('AUDITOR', '2026-10-31')).toBe('2027-02-28');
  });
});

describe('AdminActionsService.reassign', () => {
  const admin = { id: 'admin-1', role: 'ADMIN' };
  const dto = {
    assignmentType: 'CRM' as const,
    clientId: 'client-1',
    newUserId: 'crm-new',
    reason: 'rotation',
    effectiveDate: '2026-04-01',
    notifyParties: true,
  };

  function setup(opts: {
    client?: boolean;
    role?: string | null;
    current?: any;
  }) {
    const saved: any[] = [];
    const sql: string[] = [];
    const repo = (name: string) => ({
      create: (v: any) => ({ ...v, _repo: name }),
      save: async (v: any) => {
        saved.push(v);
        return { id: `${name}-id`, ...v };
      },
      createQueryBuilder: () => {
        const qb: any = {
          setLock: () => qb,
          where: () => qb,
          andWhere: () => qb,
          getOne: async () => (opts.current ? { ...opts.current } : null),
        };
        return qb;
      },
    });
    const manager = {
      query: jest.fn(async (q: string) => {
        sql.push(q);
        if (q.includes('FROM clients'))
          return opts.client === false ? [] : [{ id: 'client-1' }];
        if (q.includes('FROM users'))
          return opts.role === null ? [] : [{ code: opts.role ?? 'CRM' }];
        return [];
      }),
      getRepository: (e: any) => repo(e.name),
    };
    const service = new AdminActionsService({
      transaction: async (fn: any) => fn(manager),
    } as any);
    return { service, saved, sql };
  }

  it('only ADMIN can reassign', async () => {
    const { service } = setup({});
    await expect(
      service.reassign({ id: 'x', role: 'CRM' }, dto),
    ).rejects.toThrow('Only ADMIN');
  });

  it('validates client, user and role', async () => {
    await expect(
      setup({ client: false }).service.reassign(admin, dto),
    ).rejects.toThrow(NotFoundException);
    await expect(
      setup({ role: null }).service.reassign(admin, dto),
    ).rejects.toThrow(NotFoundException);
    await expect(
      setup({ role: 'AUDITOR' }).service.reassign(admin, dto),
    ).rejects.toThrow('is not a CRM user');
  });

  it('refuses when the caller saw a different current assignee', async () => {
    const { service } = setup({
      current: { id: 'a1', assignedToUserId: 'crm-x' },
    });
    await expect(
      service.reassign(admin, { ...dto, oldUserId: 'crm-old' }),
    ).rejects.toThrow(ConflictException);
  });

  it('is a no-op when already assigned to the same user', async () => {
    const { service, saved } = setup({
      current: { id: 'a1', assignedToUserId: 'crm-new' },
    });
    await expect(service.reassign(admin, dto)).resolves.toMatchObject({
      status: 'NO_CHANGE',
    });
    expect(saved).toHaveLength(0);
  });

  it('records history, syncs legacy columns and notifies both CRMs', async () => {
    const { service, saved, sql } = setup({
      current: {
        id: 'a1',
        assignedToUserId: 'crm-old',
        startDate: new Date('2025-04-01'),
      },
    });
    await expect(service.reassign(admin, dto)).resolves.toMatchObject({
      status: 'UPDATED',
      rotationNextDueOn: '2027-04-01',
    });
    const history = saved.find(
      (s) => s._repo === 'ClientAssignmentHistoryEntity',
    );
    expect(history).toMatchObject({
      assignedToUserId: 'crm-old',
      changeReason: 'rotation',
    });
    expect(
      sql.some((q) => q.includes('UPDATE clients SET "assigned_crm_id"')),
    ).toBe(true);
    expect(sql.some((q) => q.includes('INSERT INTO client_assignments'))).toBe(
      true,
    );
    const notified = saved
      .filter((s) => s._repo === 'NotificationEntity')
      .map((n) => n.assignedToUserId);
    expect(notified).toEqual(['crm-new', 'crm-old']);
  });
});

describe('AdminActionsService.notify', () => {
  it('refuses non-admins and writes the first message with the ticket', async () => {
    const saved: any[] = [];
    const manager = {
      getRepository: () => ({
        create: (v: any) => v,
        save: async (v: any) => {
          saved.push(v);
          return { id: 'n1', ...v };
        },
      }),
    };
    const service = new AdminActionsService({
      transaction: async (fn: any) => fn(manager),
    } as any);
    const dto = {
      targetUserId: 'u1',
      targetRole: 'CRM',
      subject: 'Hi',
      message: 'Body',
    } as any;
    await expect(service.notify({ id: 'x', role: 'CRM' }, dto)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.notify({ id: 'a', role: 'X', roleCode: 'ADMIN' }, dto),
    ).resolves.toEqual({
      status: 'SENT',
      notificationId: 'n1',
    });
    expect(saved[1]).toMatchObject({ notificationId: 'n1', message: 'Body' });
  });
});

describe('AdminApprovalsService', () => {
  const setup = (rows: any[]) => {
    const repo = memoryRepo(rows);
    const branches = {
      performDelete: jest.fn(async () => ({ deleted: true })),
      revertDeleteRequest: jest.fn(async () => ({ reverted: true })),
    };
    return {
      service: new AdminApprovalsService(repo as any, branches as any),
      repo,
      branches,
    };
  };

  it('approving a branch deletion runs the delete and records the approver', async () => {
    const { service, branches } = setup([
      {
        id: 'r1',
        status: 'PENDING',
        requestType: 'DELETE_BRANCH',
        targetEntityId: 'b1',
        reason: 'closed',
      },
    ]);
    const res = await service.approve('r1', 'admin-1', 'ok');
    expect(branches.performDelete).toHaveBeenCalledWith(
      'b1',
      'admin-1',
      'ADMIN',
      'closed',
    );
    expect(res).toMatchObject({
      status: 'APPROVED',
      approverUserId: 'admin-1',
      approverNotes: 'ok',
      actionResult: { deleted: true },
    });
  });

  it('rejecting a branch deletion restores the branch', async () => {
    const { service, branches } = setup([
      {
        id: 'r1',
        status: 'PENDING',
        requestType: 'DELETE_BRANCH',
        targetEntityId: 'b1',
      },
    ]);
    await expect(service.reject('r1', 'admin-1')).resolves.toMatchObject({
      status: 'REJECTED',
    });
    expect(branches.revertDeleteRequest).toHaveBeenCalledWith(
      'b1',
      'admin-1',
      'ADMIN',
    );
  });

  it('only acts on PENDING requests that exist', async () => {
    const { service, branches } = setup([
      { id: 'r1', status: 'APPROVED', requestType: 'DELETE_BRANCH' },
    ]);
    await expect(service.approve('r1', 'a')).rejects.toThrow(
      /status 'APPROVED'/,
    );
    await expect(service.reject('r1', 'a')).rejects.toThrow(
      /status 'APPROVED'/,
    );
    await expect(service.approve('nope', 'a')).rejects.toThrow(
      NotFoundException,
    );
    expect(branches.performDelete).not.toHaveBeenCalled();
  });

  it('counts by status and creates PENDING requests', async () => {
    const { service } = setup([
      { id: '1', status: 'PENDING' },
      { id: '2', status: 'REJECTED' },
    ]);
    await expect(service.getCounts()).resolves.toEqual({
      pending: 1,
      approved: 0,
      rejected: 1,
    });
    await expect(
      service.createApprovalRequest('DELETE_BRANCH', 'u', 'b', 'branch'),
    ).resolves.toMatchObject({ status: 'PENDING' });
  });
});
