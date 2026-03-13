import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { CeoDashboardComponent } from './ceo-dashboard.component';

describe('CeoDashboardComponent', () => {
  let component: CeoDashboardComponent;
  let fixture: ComponentFixture<CeoDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CeoDashboardComponent, HttpClientTestingModule, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(CeoDashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start in loading state', () => {
    expect(component.loading).toBe(true);
  });

  it('should have default summary values', () => {
    expect(component.summary.totalClients).toBe(0);
    expect(component.summary.pendingApprovals).toBe(0);
    expect(component.summary.overdueCompliances).toBe(0);
  });

  it('should have table column definitions', () => {
    expect(component.clientOverviewColumns.length).toBeGreaterThan(0);
    expect(component.teamColumns.length).toBeGreaterThan(0);
    expect(component.escalationColumns.length).toBeGreaterThan(0);
  });
});
