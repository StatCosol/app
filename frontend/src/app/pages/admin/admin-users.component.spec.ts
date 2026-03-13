import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AdminUsersComponent } from './admin-users.component';

describe('AdminUsersComponent', () => {
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, AdminUsersComponent],
    });
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('should create', () => {
    const fixture = TestBed.createComponent(AdminUsersComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should load users on init', () => {
    const fixture = TestBed.createComponent(AdminUsersComponent);
    fixture.detectChanges();

    const req = controller.expectOne('/api/v1/users');
    expect(req.request.method).toBe('GET');
    req.flush([
      { firstName: 'John', lastName: 'Doe', email: 'john@test.com', role: 'ADMIN', isActive: true, createdAt: '2025-01-01' },
    ]);

    fixture.detectChanges();
    expect(fixture.componentInstance.users.length).toBe(1);
    expect(fixture.componentInstance.loading).toBe(false);
  });

  it('should compute active and inactive counts', () => {
    const fixture = TestBed.createComponent(AdminUsersComponent);
    fixture.componentInstance.users = [
      { isActive: true },
      { isActive: true },
      { isActive: false },
    ] as any[];
    expect(fixture.componentInstance.activeCount).toBe(2);
    expect(fixture.componentInstance.inactiveCount).toBe(1);
  });

  it('should set error on failure', () => {
    const fixture = TestBed.createComponent(AdminUsersComponent);
    fixture.detectChanges();

    const req = controller.expectOne('/api/v1/users');
    req.error(new ProgressEvent('error'));

    fixture.detectChanges();
    expect(fixture.componentInstance.error).toBe('Failed to load users.');
    expect(fixture.componentInstance.loading).toBe(false);
  });
});
