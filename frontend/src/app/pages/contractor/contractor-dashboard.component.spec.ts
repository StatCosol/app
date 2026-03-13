import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ContractorDashboardComponent } from './contractor-dashboard.component';

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
});
