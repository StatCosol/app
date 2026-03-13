import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CrmHomeComponent } from './crm-home.component';

describe('CrmHomeComponent', () => {
  let component: CrmHomeComponent;
  let fixture: ComponentFixture<CrmHomeComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CrmHomeComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(CrmHomeComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load summary on init', () => {
    const mockSummary = { assignedClients: 5, overdue: 2, dueSoon: 3, openQueries: 1 };

    fixture.detectChanges();

    const req = httpMock.expectOne('/api/v1/crm/dashboard/summary');
    expect(req.request.method).toBe('GET');
    req.flush(mockSummary);

    expect(component.summary.assignedClients).toBe(5);
    expect(component.summary.overdue).toBe(2);
  });

  it('should handle load error', () => {
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/v1/crm/dashboard/summary');
    req.error(new ProgressEvent('error'));

    expect(component.error).toBe('Failed to load dashboard');
    expect(component.loading).toBe(false);
  });
});
