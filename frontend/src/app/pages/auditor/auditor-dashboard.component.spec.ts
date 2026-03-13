import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AuditorDashboardComponent } from './auditor-dashboard.component';

describe('AuditorDashboardComponent', () => {
  let component: AuditorDashboardComponent;
  let fixture: ComponentFixture<AuditorDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuditorDashboardComponent, HttpClientTestingModule, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(AuditorDashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start in loading state', () => {
    expect(component.loading).toBe(true);
  });

  it('should have default summary values', () => {
    expect(component.summary.assignedAuditsCount).toBe(0);
    expect(component.summary.overdueAuditsCount).toBe(0);
    expect(component.summary.reportsPendingCount).toBe(0);
  });

  it('should have table column definitions', () => {
    expect(component.auditColumns.length).toBeGreaterThan(0);
    expect(component.observationColumns.length).toBeGreaterThan(0);
    expect(component.evidenceColumns.length).toBeGreaterThan(0);
  });

  it('should default to ACTIVE audit tab', () => {
    expect(component.auditTab).toBe('ACTIVE');
  });
});
