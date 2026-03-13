import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { CeoApprovalsComponent } from './ceo-approvals.component';

describe('CeoApprovalsComponent', () => {
  let component: CeoApprovalsComponent;
  let fixture: ComponentFixture<CeoApprovalsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CeoApprovalsComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(CeoApprovalsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should count by status', () => {
    component.allApprovals = [
      { id: 1, status: 'PENDING' } as any,
      { id: 2, status: 'APPROVED' } as any,
      { id: 3, status: 'PENDING' } as any,
    ];
    expect(component.countByStatus('PENDING')).toBe(2);
    expect(component.countByStatus('APPROVED')).toBe(1);
    expect(component.countByStatus('REJECTED')).toBe(0);
  });

  it('should apply status filter', () => {
    component.allApprovals = [
      { id: 1, status: 'PENDING', entityLabel: 'Test' } as any,
      { id: 2, status: 'APPROVED', entityLabel: 'Foo' } as any,
    ];
    component.statusFilter = 'PENDING';
    component.applyFilter();
    expect(component.filteredApprovals.length).toBe(1);
    expect(component.filteredApprovals[0].id).toBe(1);
  });

  it('should apply search filter', () => {
    component.allApprovals = [
      { id: 1, status: 'PENDING', entityLabel: 'Test Entity', entityType: 'USER', requestedBy: { name: 'Alice' } } as any,
      { id: 2, status: 'PENDING', entityLabel: 'Other', entityType: 'CLIENT', requestedBy: { name: 'Bob' } } as any,
    ];
    component.searchTerm = 'alice';
    component.applyFilter();
    expect(component.filteredApprovals.length).toBe(1);
    expect(component.filteredApprovals[0].id).toBe(1);
  });
});
