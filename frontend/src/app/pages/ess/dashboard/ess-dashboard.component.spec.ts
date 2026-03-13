import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { EssDashboardComponent } from './ess-dashboard.component';

describe('EssDashboardComponent', () => {
  let component: EssDashboardComponent;
  let fixture: ComponentFixture<EssDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EssDashboardComponent, HttpClientTestingModule, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(EssDashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute total leave available', () => {
    component.leaveBalances = [
      { leaveType: 'CL', opening: '5', accrued: '2', used: '1', available: '6' } as any,
      { leaveType: 'SL', opening: '5', accrued: '0', used: '2', available: '3' } as any,
    ];
    expect(component.totalLeaveAvailable).toBe(9);
  });

  it('should generate leave summary', () => {
    component.leaveBalances = [
      { leaveType: 'CL', available: '5' } as any,
      { leaveType: 'SL', available: '3' } as any,
    ];
    expect(component.leaveSummary).toContain('CL');
    expect(component.leaveSummary).toContain('SL');
  });

  it('should return fallback when no payslips', () => {
    component.payslips = [];
    expect(component.netPay).toBe('--');
    expect(component.payslipMonth).toBe('No payslips yet');
  });

  it('should return today label', () => {
    const label = component.todayLabel;
    expect(label.length).toBeGreaterThan(0);
    expect(label).toContain(new Date().getFullYear().toString());
  });
});
