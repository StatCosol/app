import {
  assembleEmployeePayrollRecords,
  employeeBranchAllowed,
  fnfDownloadVisible,
  payslipDownloadVisible,
  resolveAuthorizedBranches,
} from './client-payroll-document-access';

describe('client payroll document access', () => {
  const branchA = '11111111-1111-1111-1111-111111111111';
  const branchB = '22222222-2222-2222-2222-222222222222';

  it('shows a payslip only when the run is approved and the published file exists', () => {
    expect(payslipDownloadVisible('APPROVED', true)).toBe(true);
    expect(payslipDownloadVisible('APPROVED', false)).toBe(false);
    expect(payslipDownloadVisible('DRAFT', true)).toBe(false);
    expect(payslipDownloadVisible('PROCESSED', true)).toBe(false);
  });

  it('shows F&F documents only after the payroll user has approved and finalized the case', () => {
    expect(fnfDownloadVisible('SETTLED', true)).toBe(true);
    expect(fnfDownloadVisible('DOCS_ISSUED', true)).toBe(true);
    expect(fnfDownloadVisible('COMPLETED', true)).toBe(true);
    expect(fnfDownloadVisible('APPROVED', true)).toBe(false);
    expect(fnfDownloadVisible('SETTLED', false)).toBe(false);
    expect(fnfDownloadVisible('INITIATED', true)).toBe(false);
    expect(fnfDownloadVisible('UNDER_REVIEW', true)).toBe(false);
  });

  it('limits BranchDesk users to assigned branches and the client payroll allow-list', () => {
    expect(
      resolveAuthorizedBranches({
        userType: 'BRANCH',
        userBranchIds: [branchA, branchB],
        payrollBranchScope: 'SELECTED',
        payrollAllowedBranchIds: [branchA],
      }).branchIds,
    ).toEqual([branchA]);

    expect(
      resolveAuthorizedBranches({
        userType: 'BRANCH',
        userBranchIds: [branchA],
        requestedBranchId: branchB,
      }).forbidden,
    ).toBe(true);

    expect(
      resolveAuthorizedBranches({
        userType: 'MASTER',
        userBranchIds: [branchA],
      }).branchIds,
    ).toBeNull();
  });

  it('hides employees outside a BranchDesk user branches and keeps LegitX client scope', () => {
    const rows = assembleEmployeePayrollRecords({
      branchIds: [branchA],
      runEmployees: [
        {
          employeeId: 'emp-a',
          employeeCode: 'A1',
          employeeName: 'Asha',
          branchId: branchA,
          runId: 'run-1',
          runStatus: 'APPROVED',
          runBranchId: branchA,
        },
        {
          employeeId: 'emp-b',
          employeeCode: 'B1',
          employeeName: 'Bala',
          branchId: branchB,
          runId: 'run-1',
          runStatus: 'APPROVED',
          runBranchId: null,
        },
        {
          employeeId: 'emp-c',
          employeeCode: 'C1',
          employeeName: 'Chitra',
          branchId: null,
          runId: 'run-2',
          runStatus: 'DRAFT',
          runBranchId: null,
        },
      ],
      archives: [
        {
          runId: 'run-1',
          employeeCode: 'A1',
          fileName: 'a.pdf',
          filePath: '/payslips/a.pdf',
        },
        {
          runId: 'run-1',
          employeeCode: 'B1',
          fileName: 'b.pdf',
          filePath: '/payslips/b.pdf',
        },
      ],
      fnfCases: [
        {
          id: 'fnf-a',
          employeeId: 'emp-a',
          status: 'SETTLED',
          updatedAt: '2026-09-01',
        },
        {
          id: 'fnf-c',
          employeeId: 'emp-c',
          status: 'INITIATED',
          updatedAt: '2026-09-02',
        },
        {
          id: 'fnf-d',
          employeeId: 'emp-d',
          status: 'SETTLED',
          updatedAt: '2026-09-03',
        },
      ],
      fnfDocuments: [],
      employees: [
        { id: 'emp-a', branchId: branchA, name: 'Asha', employeeCode: 'A1' },
        { id: 'emp-c', branchId: null, name: 'Chitra', employeeCode: 'C1' },
        { id: 'emp-d', branchId: branchA, name: 'Dev', employeeCode: 'D1' },
      ],
      fileExists: (filePath) => filePath.endsWith('a.pdf'),
    });

    expect(rows.records.map((row) => row.employeeCode)).toEqual(['A1', 'D1']);
    expect(rows.records[0]).toMatchObject({
      payslipAvailable: true,
      settlementAvailable: true,
      relievingAvailable: true,
    });
    expect(rows.bulkPayslipAvailable).toBe(true);
    expect(employeeBranchAllowed(null, null)).toBe(true);
    expect(employeeBranchAllowed([branchA], null)).toBe(false);
  });

  it('keeps an unapproved payslip hidden even when an archive file exists', () => {
    const rows = assembleEmployeePayrollRecords({
      branchIds: null,
      runEmployees: [
        {
          employeeId: 'emp-a',
          employeeCode: 'A1',
          employeeName: 'Asha',
          branchId: branchA,
          runId: 'run-1',
          runStatus: 'PROCESSED',
          runBranchId: branchA,
        },
      ],
      archives: [
        {
          runId: 'run-1',
          employeeCode: 'A1',
          fileName: 'a.pdf',
          filePath: '/payslips/a.pdf',
        },
      ],
      fnfCases: [],
      fnfDocuments: [],
      employees: [],
      fileExists: () => true,
    });

    expect(rows.records).toEqual([]);
    expect(rows.bulkPayslipAvailable).toBe(false);
  });
});
