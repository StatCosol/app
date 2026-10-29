import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { vi } from 'vitest';
import { AuditorAuditWorkspaceComponent } from './auditor-audit-workspace.component';
import { AuditsService } from '../../core/audits.service';
import { AiApiService } from '../../core/ai-api.service';
import { AuditorAuditService } from '../../core/auditor-audit.service';
import { AuditorObservationsService } from '../../core/auditor-observations.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ProtectedFileService } from '../../shared/files/services/protected-file.service';

const documents = [
  { id: 'one', branchId: 'branch-a', branchName: 'Branch A', contractorUserId: 'vendor-a', contractorName: 'Vendor A', docType: 'WAGES', fileName: 'selected-wages.pdf', status: 'SUBMITTED' },
  { id: 'two', branchId: 'branch-a', branchName: 'Branch A', contractorUserId: 'vendor-a', contractorName: 'Vendor A', docType: 'ESI', fileName: 'approved-esi.pdf', status: 'APPROVED' },
  { id: 'three', branchId: 'branch-a', branchName: 'Branch A', contractorUserId: 'vendor-b', contractorName: 'Vendor B', docType: 'WAGES', fileName: 'other-vendor.pdf', status: 'SUBMITTED' },
  { id: 'four', branchId: 'branch-b', branchName: 'Branch B', contractorUserId: 'vendor-a', contractorName: 'Vendor A', docType: 'WAGES', fileName: 'other-branch.pdf', status: 'SUBMITTED' },
];

function setup(api: any = {}) {
  const c = new AuditorAuditWorkspaceComponent({} as any, {} as any, api, {} as any, {} as any, {} as any, {} as any, {} as any, { markForCheck: vi.fn() } as any, {} as any);
  c.auditId = 'audit'; c.audit = { status: 'IN_PROGRESS', clientId: 'client' };
  c.contractorDocuments = documents.map(d => ({ ...d }));
  c.branchDocuments = [{ id: 'branch-doc', fileName: 'licence.pdf', branchId: 'branch-a', branchName: 'Branch A' }];
  return c;
}

describe('Auditor document filters', () => {
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  it('starts without combined queues and requires explicit scope for multi-branch audits', () => {
    const c = setup(); expect(c.visibleDocuments).toEqual([]);
    c.documentGroup = 'CONTRACTOR'; c.changeDocumentFilters('group');
    expect(c.contractorDocBranchFilter).toBe(''); expect(c.filteredContractorDocuments).toEqual([]);
    c.contractorDocBranchFilter = 'branch-a'; c.changeDocumentFilters('branch');
    expect(c.documentContractorFilter).toBe(''); expect(c.filteredContractorDocuments).toEqual([]);
    c.documentContractorFilter = 'vendor-a'; c.changeDocumentFilters('contractor');
    expect(c.visibleDocuments.map(d => d.id)).toEqual(['one', 'two']);
    expect(c.filteredBranchDocuments).toEqual([]);
    c.documentTypeFilter = 'WAGES'; c.documentStatusFilter = 'SUBMITTED';
    expect(c.visibleDocuments.map(d => d.id)).toEqual(['one']);
    c.documentSearch = 'does not exist'; expect(c.visibleDocuments).toEqual([]);
  });

  it('resets dependent filters and old previews on branch changes', () => {
    const c = setup(); c.documentGroup = 'CONTRACTOR'; c.changeDocumentFilters('group');
    c.contractorDocBranchFilter = 'branch-a'; c.changeDocumentFilters('branch');
    c.documentContractorFilter = 'vendor-a'; c.changeDocumentFilters('contractor');
    c.documentFileFilter = 'one'; c.documentTypeFilter = 'WAGES'; c.documentSearch = 'selected';
    c.preview = { url: '/old', name: 'old.pdf' };
    c.contractorDocBranchFilter = 'branch-b'; c.changeDocumentFilters('branch');
    expect(c.documentFileFilter).toBe(''); expect(c.documentTypeFilter).toBe(''); expect(c.documentSearch).toBe(''); expect(c.preview).toBeNull();
    expect(c.visibleDocuments.map(d => d.id)).toEqual(['four']);
  });

  it('keeps a specific file selection separate from type and status filters', () => {
    const c = setup(); c.documentGroup = 'CONTRACTOR'; c.contractorDocBranchFilter = 'branch-a'; c.documentContractorFilter = 'vendor-a';
    c.documentFileFilter = 'two'; expect(c.visibleDocuments.map(d => d.id)).toEqual(['two']);
    c.documentStatusFilter = 'SUBMITTED'; c.changeDocumentFilters('detail');
    expect(c.documentFileFilter).toBe(''); expect(c.visibleDocuments.map(d => d.id)).toEqual(['one']);
  });

  it('cancels old audit responses and clears the previous documents on scope change', () => {
    const pending = new Subject<any>();
    const c = setup({ auditorListAuditDocuments: () => pending }); c.auditDocuments = documents;
    c.loadAuditDocuments(); expect(pending.observed).toBe(true);
    vi.spyOn(c as any, 'loadCategories').mockImplementation(() => {});
    vi.spyOn(c as any, 'loadCockpit').mockImplementation(() => {});
    vi.spyOn(c, 'loadUploadLock').mockImplementation(() => {});
    (c as any).initializeForAudit('new-audit');
    expect(pending.observed).toBe(false); expect(c.auditDocuments).toEqual([]);
    pending.next({ contractorDocuments: documents }); expect(c.contractorDocuments).toEqual([]);
    expect(c.documentGroup).toBe(''); c.ngOnDestroy();
  });

  it('renders only the selected contractor queue and file, without the other groups', async () => {
    vi.spyOn(AuditorAuditWorkspaceComponent.prototype, 'ngOnInit').mockImplementation(() => {});
    await TestBed.configureTestingModule({ imports: [AuditorAuditWorkspaceComponent], providers: [ActivatedRoute, Router, AuditsService, AiApiService, AuditorAuditService, AuditorObservationsService, ToastService, ConfirmDialogService, ProtectedFileService].map(provide => ({ provide, useValue: { url: '/auditor' } })) }).compileComponents();
    const fixture = TestBed.createComponent(AuditorAuditWorkspaceComponent); const c = fixture.componentInstance;
    c.loading = false; c.auditId = 'audit'; c.audit = { status: 'IN_PROGRESS', client: { clientName: 'Client' } }; c.activeTab = 'documents';
    c.contractorDocuments = documents; c.branchDocuments = [{ id: 'branch-doc', fileName: 'hidden-branch.pdf' }];
    fixture.detectChanges(); await fixture.whenStable(); expect(fixture.nativeElement.querySelectorAll('.document-review').length).toBe(0);
    c.documentGroup = 'CONTRACTOR'; c.contractorDocBranchFilter = 'branch-a'; c.documentContractorFilter = 'vendor-a'; c.documentFileFilter = 'one';
    fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(c.visibleDocuments.map(d => d.id)).toEqual(['one']);
    const rows = fixture.nativeElement.querySelectorAll('.document-review'); expect(rows.length).toBe(1); expect(rows[0].textContent).toContain('selected-wages.pdf');
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(0);
    expect(rows[0].textContent).not.toContain('other-branch.pdf');
    fixture.destroy();
  });
});
