import { AuditorAuditWorkspaceComponent } from './auditor-audit-workspace.component';
import { vi } from 'vitest';

function workspace() {
  const c = new AuditorAuditWorkspaceComponent({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, { markForCheck: vi.fn() } as any, {} as any);
  c.audit = { status: 'SUBMITTED' }; return c;
}
describe('Auditor submission guidance', () => {
  it.each([null, 'DRAFT'] as const)('directs submitted fieldwork to report preparation when report stage is %s', stage => {
    const c = workspace(); c.reportStage = stage;
    expect(c.currentFocus.title).toBe('Prepare and submit the audit report'); expect(c.currentFocus.tab).toBe('submit');
  });
  it('distinguishes CRM review, hold, and approval', () => {
    const c = workspace(); c.reportStage = 'FINAL'; c.reportStatus = 'SUBMITTED';
    expect(c.currentFocus.title).toBe('Awaiting CRM report approval');
    c.reportHeld = true; expect(c.currentFocus.title).toBe('Report on hold');
    c.reportHeld = false; c.reportStatus = 'APPROVED'; expect(c.currentFocus.title).toBe('Ready to close audit');
  });
  it('opens the tab containing the score action', () => {
    const c = workspace(); c.audit = { status: 'IN_PROGRESS', score: null }; c.checklistItems = [{ status: 'COMPLIED' }];
    c.checklistSummary = { pending: 0 }; c.checklistTemplate = [];
    expect(c.currentFocus.title).toBe('Calculate the severity score'); expect(c.currentFocus.tab).toBe('info');
  });
});
