import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CrmComplianceComponent } from './crm-compliance.component';

describe('CrmComplianceComponent', () => {
  let component: CrmComplianceComponent;
  let fixture: ComponentFixture<CrmComplianceComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CrmComplianceComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(CrmComplianceComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load tasks on init', () => {
    const mockTasks = [
      { id: '1', title: 'PF Filing', status: 'PENDING', dueDate: '2026-04-15T00:00:00Z' },
      { id: '2', title: 'ESI Return', status: 'APPROVED', dueDate: '2026-04-20T00:00:00Z' },
    ];

    fixture.detectChanges();

    const req = httpMock.expectOne('/api/v1/compliance/tasks');
    expect(req.request.method).toBe('GET');
    req.flush(mockTasks);

    expect(component.tasks().length).toBe(2);
  });

  it('should filter approved tasks when tab selected', () => {
    const mockTasks = [
      { id: '1', title: 'PF Filing', status: 'PENDING', dueDate: '2026-04-15T00:00:00Z' },
      { id: '2', title: 'ESI Return', status: 'APPROVED', dueDate: '2026-04-20T00:00:00Z' },
    ];

    fixture.detectChanges();

    const req = httpMock.expectOne('/api/v1/compliance/tasks');
    req.flush(mockTasks);

    component.activeTab.set('APPROVED');

    expect(component.filteredTasks().length).toBe(1);
    expect(component.filteredTasks()[0].title).toBe('ESI Return');
  });
});
