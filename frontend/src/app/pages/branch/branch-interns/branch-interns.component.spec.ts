import { FaceDeskComponent } from '../../client/facedesk/facedesk.component';
import '@angular/compiler';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { BranchMarkAttendanceComponent } from '../branch-attendance/branch-mark-attendance.component';
import { BranchInternsComponent } from './branch-interns.component';
describe('Intern workspace', () => {
  it('loads only interns and saves attendance without regular employee rows', () => {
    const http = {
      get: vi.fn((url: string) =>
        of(
          url.endsWith('/employees')
            ? {
                data: [
                  { id: 'i1', employeeCode: 'I1', name: 'Intern', payrollCategory: 'INTERN' },
                  { id: 'r1', employeeCode: 'R1', name: 'Regular', payrollCategory: 'REGULAR' },
                ],
                total: 2,
              }
            : [],
        ),
      ),
      post: vi.fn(() => of({})),
    };
    const attendance = new BranchMarkAttendanceComponent(
      http as any,
      { success: vi.fn(), error: vi.fn() } as any,
      { markForCheck: vi.fn() } as any,
    );
    attendance.internOnly = true;
    attendance.load();
    attendance.markAllPresent();
    attendance.saveAll();
    expect(attendance.rows.map((r) => r.employeeId)).toEqual(['i1']);
    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('/attendance/bulk'),
      expect.objectContaining({ entries: [expect.objectContaining({ employeeId: 'i1' })] }),
    );
  });
  it('uploads documents for the selected intern with the chosen type', () => {
    const http = { post: vi.fn(() => of({})), get: vi.fn(() => of([])) };
    const component = new BranchInternsComponent({} as any, {} as any, http as any, {} as any);
    component.documentInternId = 'intern-1';
    component.documentType = 'INTERNSHIP_AGREEMENT';
    component.file = { name: 'signed.pdf' } as File;
    const append = vi.spyOn(FormData.prototype, 'append').mockImplementation(() => {});
    const input = { value: 'signed.pdf' } as HTMLInputElement;
    component.uploadDocument(input);
    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('/intern-1/upload'),
      expect.any(FormData),
    );
    expect(append).toHaveBeenCalledWith('docType', 'INTERNSHIP_AGREEMENT');
    expect(component.documentSuccess).toBe('Document uploaded.');
    expect(input.value).toBe('');
    append.mockRestore();
  });
});

describe('Intern FaceDesk and client branch view', () => {
  it('loads only interns for FaceDesk and narrows enrollment rows and kiosks to the selected branch', () => {
    const svc = {
      pendingEnrollment: vi.fn(() =>
        of([
          { employeeId: 'i1', branchId: 'b1' },
          { employeeId: 'i2', branchId: 'b2' },
        ]),
      ),
      enrolledEmployees: vi.fn(() => of([{ employeeId: 'i2', branchId: 'b2' }])),
    };
    const component = new FaceDeskComponent(
      svc as any,
      {} as any,
      {} as any,
      { detectChanges: vi.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    component.internOnly = true;
    component.enrollmentBranchId = 'b2';
    component.onEnrollmentViewChange();
    expect(svc.pendingEnrollment).toHaveBeenCalledWith('EMPLOYEE', 'INTERN');
    expect(component.pending.map((r) => r.employeeId)).toEqual(['i2']);
    component.enrollmentView = 'ENROLLED';
    component.onEnrollmentViewChange();
    expect(svc.enrolledEmployees).toHaveBeenCalledWith('EMPLOYEE', 'INTERN');
    component.deviceList = [
      { deviceId: 'd1', branchId: 'b1', deviceStatus: 'ACTIVE' },
      { deviceId: 'd2', branchId: 'b2', deviceStatus: 'ACTIVE' },
    ] as any;
    expect(component.activeDevices.map((d) => d.deviceId)).toEqual(['d2']);
  });
  it('filters client intern details, counts and document choices by branch', () => {
    const component = new BranchInternsComponent({} as any, {} as any, {} as any, {} as any);
    component.clientMode = true;
    component.branchId = 'b2';
    component.interns = [
      { id: 'i1', branchId: 'b1', name: 'One', employeeCode: 'I1', isActive: true },
      { id: 'i2', branchId: 'b2', name: 'Two', employeeCode: 'I2', isActive: false },
    ] as any;
    expect(component.filteredInterns.map((e) => e.id)).toEqual(['i2']);
    expect(component.scopedInterns.map((e) => e.id)).toEqual(['i2']);
    expect(component.branchCount('b1', true)).toBe(1);
    expect(component.branchCount('b2', true)).toBe(0);
  });
  it('requests branch attendance and does not save or count unmarked days in the client view', () => {
    const http = {
      get: vi.fn((url: string) =>
        of(
          url.endsWith('/employees')
            ? {
                data: [{ id: 'i1', employeeCode: 'I1', name: 'Intern', payrollCategory: 'INTERN' }],
                total: 1,
              }
            : [],
        ),
      ),
      post: vi.fn(),
    };
    const component = new BranchMarkAttendanceComponent(
      http as any,
      {} as any,
      { markForCheck: vi.fn() } as any,
    );
    component.readOnly = true;
    component.internOnly = true;
    component.branchId = 'b1';
    component.load();
    expect(http.get.mock.calls.every((call: any) => call[1].params.get('branchId') === 'b1')).toBe(
      true,
    );
    expect(component.countBy('PRESENT')).toBe(0);
    component.markAllPresent();
    component.saveAll();
    expect(http.post).not.toHaveBeenCalled();
  });
});
