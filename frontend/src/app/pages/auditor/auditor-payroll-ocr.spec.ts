import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ActivatedRoute, Router } from '@angular/router';
import { AuditorAuditWorkspaceComponent } from './auditor-audit-workspace.component';
import { AuditsService } from '../../core/audits.service';
import { AiApiService } from '../../core/ai-api.service';
import { AuditorAuditService } from '../../core/auditor-audit.service';
import { AuditorObservationsService } from '../../core/auditor-observations.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ProtectedFileService } from '../../shared/files/services/protected-file.service';
import { of, throwError } from 'rxjs';

describe('Auditor contractor OCR evidence', () => {
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });
  it('renders OCR excerpts and guidance in the contractor row, never the branch row', async () => {
    vi.spyOn(AuditorAuditWorkspaceComponent.prototype, 'ngOnInit').mockImplementation(() => {});
    await TestBed.configureTestingModule({ imports: [AuditorAuditWorkspaceComponent],
      providers: [ActivatedRoute, Router, AuditsService, AiApiService, AuditorAuditService,
        AuditorObservationsService, ToastService, ConfirmDialogService, ProtectedFileService]
        .map(provide => ({ provide, useValue: { url: '/auditor' } })) }).compileComponents();
    const fixture = TestBed.createComponent(AuditorAuditWorkspaceComponent);
    const c = fixture.componentInstance;
    c.loading = false; c.auditId = 'audit'; c.audit = { status: 'IN_PROGRESS', client: { clientName: 'Test client' } };
    const payrollCheck = { status: 'NEEDS_REVIEW', findings: [], ocr: { rows: 1, pages: [{ page: 1, text: 'Worker PF 1800 <script>unsafe</script>' }] } };
    c.branchDocuments = [{ id: 'branch-doc', fileName: 'branch.pdf', sourceTable: 'branch_documents', payrollCheck }] as any;
    c.contractorDocuments = [{ id: 'contractor-doc', fileName: 'vendor.pdf', sourceTable: 'contractor_documents', payrollCheck }] as any;
    fixture.detectChanges();
    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'));
    const vendor = rows.find(row => row.textContent?.includes('vendor.pdf'))!;
    const branch = rows.find(row => row.textContent?.includes('branch.pdf'))!;
    expect(vendor.textContent).toContain('1 candidate rows');
    expect(vendor.textContent).toContain('up to 5 pages and 10 MB');
    expect(vendor.querySelector('pre')?.textContent).toContain('<script>unsafe</script>');
    expect(vendor.querySelector('script')).toBeNull();
    expect(branch.textContent).not.toContain('Compare with payroll');
    expect(branch.querySelector('pre')).toBeNull();
  });
  it('restores saved remarks, keeps automation separate, and requires cross-check before deciding', () => {
    const doc = { id:'doc', status:'SUBMITTED', sourceTable:'contractor_documents', reviewNotes:'Saved auditor remark',
      payrollCheck:{status:'NC',findings:[{field:'PF',remark:'Amount differs',expected:1800,submitted:1200}]} };
    const api = { auditorListAuditDocuments:vi.fn(() => of({contractorDocuments:[doc]})), auditorReviewDocument:vi.fn(() => of({})), auditorGetNonCompliances:vi.fn(() => of({})), auditorGetChecklist:vi.fn(() => of({})) };
    const c = new AuditorAuditWorkspaceComponent({} as any,{} as any,api as any,{} as any,{} as any,
      {list:()=>of([])} as any,{success:vi.fn(),warning:vi.fn(),error:vi.fn()} as any,{} as any,{markForCheck:vi.fn()} as any,{} as any);
    c.auditId='audit'; c.audit={status:'IN_PROGRESS'};
    c.loadAuditDocuments(); expect(c.docRemarks['doc']).toBe('Saved auditor remark');
    c.useSuggestedRemarks(doc); expect(c.docRemarks['doc']).toContain('Saved auditor remark'); expect(c.docRemarks['doc']).toContain('Amount differs');
    expect(api.auditorReviewDocument).not.toHaveBeenCalled();
    c.loadAuditDocuments(); expect(c.docRemarks['doc']).toContain('Amount differs');
    c.reviewDocument(doc,'NON_COMPLIED'); expect(api.auditorReviewDocument).not.toHaveBeenCalled();
    c.automationVerified['doc']=true;
    // Stop downstream reloads so this assertion covers only the saved decision.
    vi.spyOn(c as any,'loadNonCompliances').mockImplementation(()=>{});
    vi.spyOn(c,'loadChecklist').mockImplementation(()=>{});
    vi.spyOn(c as any,'loadObservations').mockImplementation(()=>{});
    c.reviewDocument(doc,'NON_COMPLIED');
    expect(api.auditorReviewDocument).toHaveBeenCalledWith('audit','doc','NON_COMPLIED',expect.stringContaining('Saved auditor remark'),'contractor_documents');
    expect(c.workspaceTabs.some(tab=>tab.key==='findings')).toBe(true);
  });
  it('blocks submission when document loading fails', () => {
    const c = new AuditorAuditWorkspaceComponent({} as any,{} as any,
      {auditorListAuditDocuments:()=>throwError(()=>new Error('offline'))} as any,{} as any,{} as any,{} as any,
      {} as any,{} as any,{markForCheck:vi.fn()} as any,{} as any);
    c.auditId='audit'; c.loadAuditDocuments(); expect(c.canSubmitReviewRound).toBe(false); expect(c.documentsError).toContain('could not be loaded');
  });
});
