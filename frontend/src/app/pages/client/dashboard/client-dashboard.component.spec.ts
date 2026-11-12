import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ClientDashboardComponent } from './client-dashboard.component';

describe('ClientDashboardComponent', () => {
  let component: ClientDashboardComponent;
  let fixture: ComponentFixture<ClientDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClientDashboardComponent, HttpClientTestingModule, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(ClientDashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have empty state initially', () => {
    expect(component.data).toBeNull();
    expect(component.loading).toBe(false);
    expect(component.branches).toEqual([]);
  });
});

 describe('Client dashboard consistent risk source',()=>{
  it('uses the company snapshot without a second scoring request',()=>{
   const component=Object.create(ClientDashboardComponent.prototype) as any;
   component.companySummary={items:[{branchId:'one',inspectionProbability:80,riskLevel:'HIGH',completionPercent:0}]};
   component.loadBranchRiskOverview();
   expect(component.branchRiskOverview).toBe(component.companySummary.items);
   expect(component.branchRiskError).toBe('');
  });
  it('does not retain the old branch scores when snapshot data is unavailable',()=>{
   const component=Object.create(ClientDashboardComponent.prototype) as any;
   component.branchRiskOverview=[{riskLevel:'LOW'}];component.companySummary=null;
   component.loadBranchRiskOverview();
   expect(component.branchRiskOverview).toEqual([]);expect(component.branchRiskError).toContain('unavailable');
  });
  it('distinguishes identical contractor names by branch',()=>{
   const component=Object.create(ClientDashboardComponent.prototype) as any;
   component.filters={branchId:'one'};
   component.branches=[{id:'one',name:'Unit 1'},{id:'two',name:'Unit 2'}];
   expect(component.contractorOptionLabel({name:'Vendor',branchId:'one'})).toBe('Vendor — Unit 1');
   expect(component.contractorOptionLabel({name:'Vendor',branchId:'two'})).toBe('Vendor — Unit 2');
  });
 });
