import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AdminBranchesComponent } from './admin-branches.component';

describe('AdminBranchesComponent', () => {
  let component: AdminBranchesComponent;
  let fixture: ComponentFixture<AdminBranchesComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminBranchesComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminBranchesComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load branches on init', () => {
    const mockBranches = [
      { name: 'Mumbai HQ', code: 'MUM01', clientName: 'Acme', state: 'Maharashtra', status: 'ACTIVE' },
      { name: 'Delhi Branch', code: 'DEL01', clientName: 'Acme', state: 'Delhi', status: 'INACTIVE' },
    ];

    fixture.detectChanges();

    const req = httpMock.expectOne('/api/v1/branches');
    expect(req.request.method).toBe('GET');
    req.flush(mockBranches);

    expect(component.branches.length).toBe(2);
    expect(component.branches[0].name).toBe('Mumbai HQ');
  });

  it('should handle load error', () => {
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/v1/branches');
    req.error(new ProgressEvent('error'));

    expect(component.error).toBe('Failed to load branches');
    expect(component.loading).toBe(false);
  });
});
