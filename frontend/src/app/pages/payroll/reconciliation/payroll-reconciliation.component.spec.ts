import { TestBed, ComponentFixture } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { PayrollReconciliationComponent, ReconciliationReport } from './payroll-reconciliation.component';
import { AuthService } from '../../../core/auth.service';



const sample: ReconciliationReport = {
 run:{id:'run1',clientId:'client',branchId:null,period:'2026-09',status:'PROCESSED',updatedAt:'2026-09-12'},
 source:{fileName:'wages.csv',sha256:'source-hash'},baselineSha256:'baseline-hash',generatedAt:'2026-09-12T09:00:00Z',comparedBy:'reviewer',
 fields:['gross_earnings','net_pay'],uncheckedFields:['pf_employee','esi_employee'],note:'Review findings before acting; payroll is unchanged.',
 summary:{payrollEmployees:1,fileEmployees:1,matched:0,mismatched:1,missingInFile:0,extraInFile:0,unverifiable:0},
 totals:[{field:'gross_earnings',expected:{amount:'100.00',missingValues:0},actual:{amount:'101.00',missingValues:0}}],
 rows:[{employeeCode:'001',sourceLine:2,status:'MISMATCH',comparisons:[{field:'gross_earnings',expected:'100.00',actual:'101.00',difference:'1.00',state:'MISMATCH'}]}],
};
describe('PayrollReconciliationComponent',()=>{
 let fixture:ComponentFixture<PayrollReconciliationComponent>, component:PayrollReconciliationComponent, http:HttpTestingController;
 let downloads: Blob[] = []; let downloadNames: string[] = [];
 const auth={getRoleCode:vi.fn(()=> 'PAYROLL')};
 beforeEach(async()=>{
  auth.getRoleCode.mockReturnValue('PAYROLL'); downloads = []; downloadNames = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => { downloads.push(blob as Blob); return 'blob:synthetic-download'; });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function(this: HTMLAnchorElement) { downloadNames.push(this.download); });
  await TestBed.configureTestingModule({imports:[HttpClientTestingModule,PayrollReconciliationComponent],providers:[{provide:AuthService,useValue:auth}]}).compileComponents();
  fixture=TestBed.createComponent(PayrollReconciliationComponent);component=fixture.componentInstance;http=TestBed.inject(HttpTestingController);
  fixture.componentRef.setInput('runId','run1');fixture.componentRef.setInput('period','2026-09');fixture.componentRef.setInput('runStatus','PROCESSED');fixture.detectChanges();
 });
 afterEach(()=>{ http.verify({ignoreCancelled:true}); vi.restoreAllMocks(); });
 const file=()=>new File(['employee_code,period,gross_earnings,net_pay\n001,2026-09,101,90'],'wages.csv',{type:'text/csv'});
 function select(f:File){component.selectFile({target:{files:[f],value:'file'}} as unknown as Event);}
 function load(){select(file());component.compare();http.expectOne('/api/v1/payroll/runs/run1/reconcile-register').flush(sample);fixture.detectChanges();}
 it('sends a multipart file and shows amount differences and excluded fields',()=>{
  select(file());component.compare();const request=http.expectOne('/api/v1/payroll/runs/run1/reconcile-register');
  expect(request.request.body instanceof FormData).toBe(true);expect(request.request.body.get('file').name).toBe('wages.csv');request.flush(sample);fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Amounts differ');expect(fixture.nativeElement.textContent).toContain('Not compared because columns were omitted');expect(component.busy()).toBe(false);
 });
 it('clears old results when a new file is selected',()=>{load();select(file());expect(component.result()).toBeNull();});
 it('cancels pending requests and clears files when changing runs',()=>{
  select(file());component.compare();const request=http.expectOne('/api/v1/payroll/runs/run1/reconcile-register');
  fixture.componentRef.setInput('runId','run2');fixture.detectChanges();expect(request.cancelled).toBe(true);expect(component.file).toBeNull();expect(component.result()).toBeNull();
 });
 it('shows server validation failures without retaining a successful report',()=>{
  load();component.compare();http.expectOne('/api/v1/payroll/runs/run1/reconcile-register').flush({message:'Reporting period differs.'},{status:400,statusText:'Bad Request'});fixture.detectChanges();
  expect(component.result()).toBeNull();expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Reporting period differs');
 });
 it('rejects unsupported and oversized files without a request',()=>{
  select(new File(['scan'],'wages.pdf'));expect(component.file).toBeNull();
  select(new File([new Uint8Array(1024*1024+1)],'large.csv'));expect(component.file).toBeNull();component.compare();http.expectNone('/api/v1/payroll/runs/run1/reconcile-register');
 });
 it('does not offer comparison to a client or for unprocessed payroll',()=>{
  auth.getRoleCode.mockReturnValue('CLIENT');component.runStatus='DRAFT';select(file());component.compare();expect(component.allowed).toBe(false);http.expectNone('/api/v1/payroll/runs/run1/reconcile-register');
 });
 it('downloads all findings and source fingerprints even when filtered out',async()=>{
  load();component.search='not-present';expect(component.visibleRows()).toEqual([]);await component.download();
  const blob = downloads[0];const report=JSON.parse(await blob.text());expect(report.rows).toHaveLength(1);expect(report.baselineSha256).toBe('baseline-hash');expect(report.source.sha256).toBe('source-hash');
 });
 it('includes the selected month in the CSV template',async()=>{
  await component.template();const blob = downloads[0]; const name = downloadNames[0];expect(await blob.text()).toContain('2026-09');expect(name).toBe('wage-register-template.csv');
 });
});