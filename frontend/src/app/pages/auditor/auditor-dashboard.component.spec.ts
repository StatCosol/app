import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuditorObservationsService } from '../../core/auditor-observations.service';
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
  it('offers Start Audit for planned assignments', () => {
    expect(component.getAuditActionLabel({ status: 'PLANNED' } as any)).toBe('Start Audit');
  });

  it('routes follow-up and closure to scoped verification without changing records', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const update = vi.spyOn(TestBed.inject(AuditorObservationsService), 'update');
    const observation = { auditId: 'audit-a', observationId: 'observation-a' } as any;
    component.followUpObservation(observation);
    component.closeObservation(observation);
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith(['/auditor/observations'], {
      queryParams: { auditId: 'audit-a', observationId: 'observation-a' },
    });
    expect(update).not.toHaveBeenCalled();
  });
});
