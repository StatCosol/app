import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { ComplianceAssistantComponent } from './compliance-assistant.component';

function setup() {
  const http = { post: vi.fn(), put: vi.fn(), delete: vi.fn() };
  const files = { open: vi.fn().mockReturnValue(of(undefined)) };
  const component = new ComplianceAssistantComponent(http as any, files as any);
  component.month = 8;
  component.year = 2026;
  component.branchId = 'branch';
  component.documentRequest = "Show Ravi Kumar's last payslip";
  return { component, http, files };
}
const doc = {
  id: 'run',
  kind: 'PAYSLIP',
  title: 'Published payslip',
  owner: 'Ravi Kumar',
  branchId: 'branch',
  employeeCode: 'EMP 1',
  status: 'APPROVED',
  period: '2026-08',
};
const found = {
  status: 'EXACT',
  message: 'Matched',
  sourceLabel: 'Recorded data',
  coverage: 'Existing files',
  documents: [doc],
};

describe('Assist document and voice UI', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('opens an exact result through the authenticated existing viewer without a write call', () => {
    const { component, http, files } = setup();
    http.post.mockReturnValue(of(found));
    component.findDocuments();
    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('/legitx/assistant/documents/find'),
      { request: "Show Ravi Kumar's last payslip", month: 8, year: 2026, branchId: 'branch' },
    );
    expect(files.open).toHaveBeenCalledWith(
      expect.stringContaining('branchId=branch&employeeCode=EMP+1'),
      'Published payslip',
    );
    expect(http.put).not.toHaveBeenCalled();
    expect(http.delete).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });
  it('requires selection for an ambiguous result', () => {
    const { component, http, files } = setup();
    http.post.mockReturnValue(of({ ...found, status: 'SHORTLIST' }));
    component.findDocuments();
    expect(files.open).not.toHaveBeenCalled();
    component.openDocument(doc);
    expect(files.open).toHaveBeenCalledOnce();
  });
  it('does not open an unavailable result or expose server error metadata', () => {
    const { component, http, files } = setup();
    http.post.mockReturnValue(
      throwError(() => ({ error: { message: 'Restricted employee exists' } })),
    );
    component.findDocuments();
    expect(files.open).not.toHaveBeenCalled();
    expect(component.documentError()).not.toContain('Restricted employee exists');
    expect(component.documentLoading()).toBe(false);
  });
  it('discards results after a scope change and never opens a stale document', () => {
    const { component, http, files } = setup();
    const pending = new Subject<any>();
    http.post.mockReturnValue(pending);
    component.findDocuments();
    component.branchId = 'other';
    component.ngOnChanges();
    pending.next(found);
    expect(component.documentResult()).toBeNull();
    expect(files.open).not.toHaveBeenCalled();
  });
  it('captures voice as editable text and uses the same request path after review', () => {
    let recognition: any;
    class Recognition {
      onresult: any;
      onend: any;
      onerror: any;
      start() {
        recognition = this;
      }
      abort() {}
    }
    vi.stubGlobal('window', { SpeechRecognition: Recognition });
    const { component, http } = setup();
    http.post.mockReturnValue(of({ ...found, status: 'UNAVAILABLE', documents: [] }));
    component.startVoice();
    recognition.onresult({ results: [[{ transcript: 'Show PF challan for August' }]] });
    recognition.onend();
    expect(component.documentRequest).toBe('Show PF challan for August');
    expect(http.post).not.toHaveBeenCalled();
    component.findDocuments();
    expect(http.post.mock.calls[0][1].request).toBe('Show PF challan for August');
    component.ngOnDestroy();
  });
});
