import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { CrmReuploadBacklogComponent } from './crm-reupload-backlog.component';

function setup() {
  const files = { open: vi.fn().mockReturnValue(of(undefined)) };
  const component = new CrmReuploadBacklogComponent(
    {} as any,
    {} as any,
    {} as any,
    files as any,
    {} as any,
  );
  return { component, files };
}

afterEach(() => vi.useRealTimers());

describe('CRM reupload backlog', () => {
  it('uses calendar deadlines: yesterday is overdue, today and tomorrow are not', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T23:59:00Z'));
    const { component } = setup();
    expect(component.isOverdue({ deadlineDate: '2026-09-21', status: 'OPEN' } as any)).toBe(true);
    expect(component.isOverdue({ deadlineDate: '2026-09-22', status: 'OPEN' } as any)).toBe(false);
    expect(component.isOverdue({ deadlineDate: '2026-09-23', status: 'SUBMITTED' } as any)).toBe(
      false,
    );
    expect(component.isOverdue({ deadlineDate: '2026-09-21', status: 'REVERIFIED' } as any)).toBe(
      false,
    );
    expect(component.isOverdue({ deadlineDate: '2026-09-21', status: 'CLOSED' } as any)).toBe(
      false,
    );
  });
  it('opens the selected document using the authenticated file service', () => {
    const { component, files } = setup();
    component.viewDocument({
      documentFilePath: 'uploads/compliance/exact.pdf',
      documentFileName: 'exact.pdf',
    } as any);
    expect(files.open).toHaveBeenCalledWith('uploads/compliance/exact.pdf', 'exact.pdf');
  });
  it('does not navigate elsewhere when the referenced document is unavailable', () => {
    const { component, files } = setup();
    component.viewDocument({ documentFilePath: null } as any);
    expect(files.open).not.toHaveBeenCalled();
  });
});
