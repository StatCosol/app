import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { CcoDashboardComponent } from './cco-dashboard.component';

describe('CcoDashboardComponent', () => {
  let component: CcoDashboardComponent;
  let fixture: ComponentFixture<CcoDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CcoDashboardComponent, HttpClientTestingModule, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(CcoDashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start in loading state', () => {
    expect(component.loading).toBe(true);
  });

  it('should have default data values', () => {
    expect(component.data.pendingApprovals).toBe(0);
    expect(component.data.totalCrms).toBe(0);
    expect(component.crms).toEqual([]);
  });

  it('should have table column definitions', () => {
    expect(component.crmColumns.length).toBeGreaterThan(0);
    expect(component.overdueColumns.length).toBeGreaterThan(0);
    expect(component.oversightColumns.length).toBeGreaterThan(0);
  });
});
