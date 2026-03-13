import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { AdminClientsComponent } from './admin-clients.component';

describe('AdminClientsComponent', () => {
  let component: AdminClientsComponent;
  let fixture: ComponentFixture<AdminClientsComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminClientsComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminClientsComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load clients on init', () => {
    const mockClients = [
      { id: '1', name: 'Acme Corp', code: 'ACM', state: 'Maharashtra', industry: 'IT', isActive: true },
      { id: '2', name: 'Beta Ltd', code: 'BET', state: 'Delhi', industry: 'Pharma', isActive: false },
    ];

    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/clients'));
    expect(req.request.method).toBe('GET');
    req.flush(mockClients);

    expect(component.clients.length).toBe(2);
  });

  it('should toggle drawer open and close', () => {
    expect(component.drawerOpen).toBe(false);
    component.openDrawer();
    expect(component.drawerOpen).toBe(true);
    component.closeDrawer();
    expect(component.drawerOpen).toBe(false);
  });

  it('should identify active clients', () => {
    expect(component.isClientActive({ id: '1', name: 'Test', isActive: true } as any)).toBe(true);
    expect(component.isClientActive({ id: '2', name: 'Test', active: true } as any)).toBe(true);
    expect(component.isClientActive({ id: '3', name: 'Test', isActive: false } as any)).toBe(false);
  });
});
