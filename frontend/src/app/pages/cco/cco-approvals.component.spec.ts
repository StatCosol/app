import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { CcoApprovalsComponent } from './cco-approvals.component';

describe('CcoApprovalsComponent', () => {
  let component: CcoApprovalsComponent;
  let fixture: ComponentFixture<CcoApprovalsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CcoApprovalsComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(CcoApprovalsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start in loading state', () => {
    expect(component.loading).toBe(true);
  });

  it('should apply status filter', () => {
    component.requests = [
      { id: 1, status: 'PENDING', crmName: 'CRM1' },
      { id: 2, status: 'APPROVED', crmName: 'CRM2' },
    ];
    component.statusFilter = 'PENDING';
    component.applyFilter();
    expect(component.filteredRequests.length).toBe(1);
    expect(component.filteredRequests[0].id).toBe(1);
  });

  it('should apply search filter', () => {
    component.requests = [
      { id: 1, status: 'PENDING', crmName: 'Alpha CRM', email: 'a@x.com', reason: '' },
      { id: 2, status: 'PENDING', crmName: 'Beta CRM', email: 'b@x.com', reason: '' },
    ];
    component.searchTerm = 'alpha';
    component.applyFilter();
    expect(component.filteredRequests.length).toBe(1);
  });
});
