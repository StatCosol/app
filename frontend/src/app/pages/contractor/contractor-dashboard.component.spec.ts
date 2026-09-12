import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ContractorDashboardComponent } from './contractor-dashboard.component';
import { Router } from '@angular/router';
import { vi } from 'vitest';

describe('ContractorDashboardComponent', () => {
  let component: ContractorDashboardComponent;
  let fixture: ComponentFixture<ContractorDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContractorDashboardComponent, HttpClientTestingModule, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(ContractorDashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute stroke offset from compliance pct', () => {
    component.compliancePct = 75;
    const expected = component.circumference - (75 / 100) * component.circumference;
    expect(component.strokeOffset).toBeCloseTo(expected, 2);
  });

  it('should have circumference based on radius 52', () => {
    expect(component.circumference).toBeCloseTo(2 * Math.PI * 52, 2);
  });

  it('counts only items needing upload and links reuploads with their type', () => {
    component.data = { pendingReviewDocs: 7 } as typeof component.data;
    component.tasks = [
      { id: 'task', title: 'Task', branchName: '-', clientName: '-', dueDate: null, status: 'PENDING' },
      { id: 'submitted', title: 'Submitted', branchName: '-', clientName: '-', dueDate: null, status: 'SUBMITTED' },
    ];
    component.reuploads = [{ id: 'request', status: 'OPEN' }, { id: 'closed', status: 'CLOSED' }];
    component.checklistItems = [
      { id: 'missing', uploaded: false },
      { id: 'review', uploaded: true, uploadedDocs: [{ status: 'PENDING_REVIEW' }] },
    ];
    component['computeOperationalWidgets']();

    expect(component.pendingUploadsCount).toBe(3);
    expect(component.pendingUploadsPreview.map(row => row.id)).toEqual(['missing', 'task', 'request']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.openTask(component.pendingUploadsPreview[2]);
    expect(navigate).toHaveBeenCalledWith(['/contractor/tasks', 'request'], {
      queryParams: { type: 'REUPLOAD' },
    });
  });

  it('carries the checklist month across the January year boundary', () => {
    component.checklistMonthKey = '2025-12';
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.openTask({ id: 'monthly-doc', checklist: true });
    expect(navigate).toHaveBeenCalledWith(['/contractor/tasks'], {
      queryParams: { month: '2025-12' },
    });
  });

  it('preserves regular task navigation', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.openTask({ id: 'task' });
    expect(navigate).toHaveBeenCalledWith(['/contractor/tasks', 'task']);
  });
  it('counts only actionable tasks due today', () => {
    const dueDate = new Date().toISOString();
    component.tasks = ['PENDING', 'IN_PROGRESS', 'REJECTED', 'APPROVED', 'SUBMITTED', 'CLOSED'].map(status => ({
      id: status, title: status, status, dueDate, branchName: '-', clientName: '-',
    }));
    expect(component.dueTodayCount).toBe(3);
  });

  it('preserves the checklist month on dashboard summary links', () => {
    component.checklistMonthKey = '2025-12';
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    for (const status of ['DUE_TODAY', 'OVERDUE', 'SUBMITTED']) {
      component.goToTasks(status);
      expect(navigate).toHaveBeenLastCalledWith(['/contractor/tasks'], {
        queryParams: { status, month: '2025-12' },
      });
    }
  });
});
