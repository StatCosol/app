import { NotFoundException } from '@nestjs/common';
import { ClientPayrollDocumentsService } from '../payroll/client-payroll-documents.service';
import { ReqUser } from '../access/access-scope.service';

describe('Assist stored-only F&F reader', () => {
  it('never invokes generation when the stored file is missing, while preserving existing portal behavior', async () => {
    const renderer = {
      renderFnfDocumentPdf: jest.fn().mockResolvedValue({
        buffer: Buffer.from('rendered'),
        filename: 'fnf.pdf',
        mimeType: 'application/pdf',
      }),
    };
    const service = new ClientPayrollDocumentsService(
      { findOne: jest.fn().mockResolvedValue({ settings: {} }) } as any,
      {} as any,
      {} as any,
      {} as any,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'fnf',
          clientId: 'company',
          employeeId: 'employee',
          status: 'SETTLED',
        }),
      } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 'employee',
          clientId: 'company',
          branchId: 'branch',
        }),
      } as any,
      renderer as any,
    );
    const user = {
      id: 'user',
      userId: 'user',
      roleCode: 'CLIENT',
      userType: 'MASTER',
      clientId: 'company',
      branchIds: [],
    } as unknown as ReqUser;
    await expect(
      service.downloadFnfDocument(user, 'fnf', 'SETTLEMENT_STATEMENT', {
        storedOnly: true,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(renderer.renderFnfDocumentPdf).not.toHaveBeenCalled();
    expect(
      (
        await service.downloadFnfDocument(user, 'fnf', 'SETTLEMENT_STATEMENT')
      ).buffer.toString(),
    ).toBe('rendered');
    expect(renderer.renderFnfDocumentPdf).toHaveBeenCalledTimes(1);
  });
});
