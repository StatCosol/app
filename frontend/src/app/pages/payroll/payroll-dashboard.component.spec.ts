import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { PayrollDashboardComponent } from './payroll-dashboard.component';

describe('PayrollDashboardComponent', () => {
  let component: PayrollDashboardComponent;
  let fixture: ComponentFixture<PayrollDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PayrollDashboardComponent, HttpClientTestingModule, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(PayrollDashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have empty state initially', () => {
    expect(component.summary).toBeNull();
    expect(component.clients).toEqual([]);
    expect(component.recentRuns).toEqual([]);
  });

  it('should compute active runs count', () => {
    component.recentRuns = [
      { status: 'PROCESSING' } as any,
      { status: 'DRAFT' } as any,
      { status: 'COMPLETED' } as any,
    ];
    expect(component.activeRunsCount).toBe(2);
  });
});
