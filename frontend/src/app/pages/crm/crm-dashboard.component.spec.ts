import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { CrmDashboardComponent } from './crm-dashboard.component';

describe('CrmDashboardComponent', () => {
  let component: CrmDashboardComponent;
  let fixture: ComponentFixture<CrmDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CrmDashboardComponent, HttpClientTestingModule, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(CrmDashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with loading disabled before init', () => {
    expect(component.loading).toBe(false);
  });

  it('should have empty kpis initially', () => {
    expect(component.kpis.assignedClientsCount).toBe(0);
    expect(component.kpis.overdueCount).toBe(0);
  });
});
