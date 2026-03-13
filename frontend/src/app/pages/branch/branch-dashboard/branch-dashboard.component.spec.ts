import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { BranchDashboardComponent } from './branch-dashboard.component';

describe('BranchDashboardComponent', () => {
  let component: BranchDashboardComponent;
  let fixture: ComponentFixture<BranchDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BranchDashboardComponent, HttpClientTestingModule, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(BranchDashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start in loading state', () => {
    expect(component.loading).toBe(true);
  });

  it('should have default KPI values', () => {
    expect(component.employeeTotal).toBe(0);
    expect(component.compliancePercent).toBe(0);
    expect(component.pfPending).toBe(0);
  });
});
