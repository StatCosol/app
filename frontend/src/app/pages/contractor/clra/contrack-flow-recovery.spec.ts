import { page } from '@vitest/browser/context';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { ContractorClraWorkspaceComponent } from './contractor-clra-workspace.component';
import { CrmClraAssignmentDetailComponent } from '../../crm/clra/crm-clra-assignment-detail.component';
import { ClraApiService } from '../../../core/clra-api.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { contrackSample as sample } from './contrack-sample.fixture';

const failure = () => throwError(() => ({status: 503}));
const cdr = () => ({markForCheck: vi.fn()});
const toast = () => ({error: vi.fn(), success: vi.fn(), warning: vi.fn()});
function api() {
  return {
    getMyContractor: vi.fn(() => of(sample.contractor)),
    listMyAssignments: vi.fn(() => of([sample.assignment])),
    listMyWorkers: vi.fn(() => of(sample.workers)),
    listMyDeployments: vi.fn(() => of(sample.deployments)),
    listMyWagePeriods: vi.fn(() => of(sample.periods)),
    listMyAttendance: vi.fn(() => of([sample.attendance[1]])),
    listMyWages: vi.fn(() => of([sample.wages[1]])),
    listMyRegisterRuns: vi.fn(() => of(sample.registers)),
    createMyWorker: vi.fn(() => of(sample.workers[0])),
    upsertMyAttendance: vi.fn(() => of(sample.attendance[1])),
    upsertMyWage: vi.fn(() => of(sample.wages[1])),
  };
}
function workspace(a = api()) {
  const t = toast();
  const c = new ContractorClraWorkspaceComponent(a as any, t as any, cdr() as any);
  return {c, a, t};
}
function detail(a: any = api()) {
  const t = toast();
  const c = new CrmClraAssignmentDetailComponent(a, t as any, cdr() as any);
  c.portalMode = true;
  c.assignment = sample.assignment;
  c.selectedWagePeriodId = sample.periods[1].id;
  return {c, a, t};
}

describe('ConTrack CLRA sample-data recovery', () => {
  it('renders load failure and a working retry instead of an empty assignment list', async () => {
    const a = api();
    a.listMyAssignments.mockImplementationOnce(failure);
    await TestBed.configureTestingModule({imports: [ContractorClraWorkspaceComponent], providers: [
      {provide: ClraApiService, useValue: a}, {provide: ToastService, useValue: toast()},
    ]}).compileComponents();
    const fixture = TestBed.createComponent(ContractorClraWorkspaceComponent);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.textContent).toContain('Could not load assignments');
    expect(host.textContent).not.toContain('No CLRA assignments');
    (host.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.textContent).toContain(sample.assignment.assignmentCode);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    fixture.destroy();
  });

  it('keeps all CLRA detail tabs visible on a narrow screen', async () => {
    await page.viewport(390, 844);
    const a = api();
    await TestBed.configureTestingModule({imports: [CrmClraAssignmentDetailComponent], providers: [
      {provide: ClraApiService, useValue:a}, {provide:ToastService,useValue:toast()},
    ]}).compileComponents();
    const fixture = TestBed.createComponent(CrmClraAssignmentDetailComponent);
    fixture.componentRef.setInput('assignment', sample.assignment);
    fixture.componentRef.setInput('portalMode', true);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    for (const tab of fixture.componentInstance.detailTabs) {
      const button = [...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===tab.label)!;
      expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(390);
      expect(button.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
    }
    fixture.componentInstance.selectWagePeriod(sample.periods[1]);
    fixture.componentInstance.setDetailTab('wages');
    fixture.detectChanges();
    expect(host.textContent).toContain('\u20b910,500.00');
    fixture.destroy();
  });

  it('recovers the workers list after failure', () => {
    const {c, a} = workspace();
    a.listMyWorkers.mockImplementationOnce(failure);
    c.ngOnInit();
    expect(c.workersState.error).toContain('Could not load workers');
    expect(c.workersState.loading).toBe(false);
    c.loadWorkers();
    expect(c.workers).toEqual(sample.workers);
    expect(c.workersState.error).toBe('');
    c.ngOnDestroy();
  });

  it.each([0, 401, 403, 404, 500, 503])('does not mislabel HTTP %s as missing profile linkage', status => {
    const {c, a} = workspace();
    a.getMyContractor.mockImplementationOnce(() => throwError(() => ({status})));
    c.ngOnInit();
    expect(c.linkError).toBe('Could not load your CLRA profile. Please retry.');
    c.reload();
    expect(c.contractor).toEqual(sample.contractor);
    expect(c.linkError).toBe('');
    c.ngOnDestroy();
  });

  it('shows linking guidance only for the explicit backend linkage error', () => {
    const {c, a} = workspace();
    a.getMyContractor.mockImplementationOnce(() => throwError(() => ({status:404, error:{message:'CLRA contractor profile is not linked to your account. Contact your CRM team.'}})));
    c.ngOnInit();
    expect(c.linkError).toContain('Ask your CRM team');
    c.ngOnDestroy();
  });

  it('saves a sample worker and refreshes the list without duplicate submission', () => {
    const {c, a, t} = workspace();
    const pending = new Subject<any>();
    a.createMyWorker.mockReturnValue(pending);
    c.contractor = sample.contractor;
    c.openWorkerForm();
    c.workerForm.workerCode = sample.workers[0].workerCode;
    c.workerForm.fullName = sample.workers[0].fullName;
    c.saveWorker(); c.saveWorker();
    expect(a.createMyWorker).toHaveBeenCalledTimes(1);
    pending.next(sample.workers[0]); pending.complete();
    expect(c.showWorkerForm).toBe(false);
    expect(c.workers).toEqual(sample.workers);
    expect(t.success).toHaveBeenCalledTimes(1);
    c.ngOnDestroy();
  });

  it('keeps a failed worker form available for correction or retry', () => {
    const {c, a, t} = workspace();
    a.createMyWorker.mockImplementationOnce(failure);
    c.openWorkerForm(sample.workers[0]);
    delete c.workerForm.id;
    c.saveWorker();
    expect(c.showWorkerForm).toBe(true);
    expect(c.saving).toBe(false);
    expect(t.success).not.toHaveBeenCalled();
    expect(t.error).toHaveBeenCalled();
  });

  for (const [method, key, list] of [
    ['loadContractorWorkers', 'contractorWorkers', 'listMyWorkers'],
    ['loadDeployments', 'deployments', 'listMyDeployments'],
    ['loadWagePeriods', 'wagePeriods', 'listMyWagePeriods'],
    ['loadAttendance', 'attendance', 'listMyAttendance'],
    ['loadWages', 'wages', 'listMyWages'],
    ['loadRegisterRuns', 'registerRuns', 'listMyRegisterRuns'],
  ]) {
    it(`reports and retries failed ${key}`, () => {
      const {c, a} = detail();
      c.detailTab = ({contractorWorkers:'deployments', deployments:'deployments', wagePeriods:'wage-periods', attendance:'attendance', wages:'wages', registerRuns:'registers'} as any)[key];
      a[list].mockImplementationOnce(failure);
      (c as any)[method]();
      expect(c.loadError).toContain('Could not load');
      expect(c.loading).toBe(false);
      c.retryDetail();
      expect(c.loadError).toBe('');
      expect((c as any)[key].length).toBeGreaterThan(0);
      c.ngOnDestroy();
    });
  }

  for (const [method, list, key] of [['loadAttendance', 'listMyAttendance', 'attendance'], ['loadWages', 'listMyWages', 'wages']]) {
    it(`cancels old-period ${key}, including late errors`, () => {
      const {c, a} = detail();
      const old = new Subject<any[]>();
      const current = new Subject<any[]>();
      a[list].mockReturnValueOnce(old).mockReturnValueOnce(current);
      c.selectWagePeriod(sample.periods[0]);
      (c as any)[method]();
      expect(old.observed).toBe(true);
      c.selectWagePeriod(sample.periods[1]);
      expect(old.observed).toBe(false);
      (c as any)[method]();
      const rows = [(sample as any)[key][1]];
      current.next(rows); current.complete();
      old.next([(sample as any)[key][0]]); old.error(new Error('late failure'));
      expect((c as any)[key]).toEqual(rows);
      expect(c.loadError).toBe('');
      c.ngOnDestroy();
    });
  }

  it('cancels all previous assignment loads and clears forms and period rows', () => {
    const {c, a} = detail();
    const pending = new Subject<any[]>();
    a.listMyDeployments.mockReturnValueOnce(pending);
    (c as any).loadDeployments();
    c.showAttendanceForm = true;
    c.assignment = {...sample.assignment, id:'other-assignment'};
    c.ngOnChanges({assignment: {} as any});
    expect(pending.observed).toBe(false);
    expect(c.selectedWagePeriodId).toBe('');
    expect(c.showAttendanceForm).toBe(false);
    expect(c.attendance).toEqual([]);
    c.ngOnDestroy();
  });

  it.each(['Attendance', 'Wage'])('blocks a stale %s form from posting into another period', kind => {
    const {c, a, t} = detail();
    const form = kind === 'Attendance' ? 'attendanceForm' : 'wageForm';
    (c as any)[form] = {...(c as any)[form], wagePeriodId:sample.periods[0].id, workerDeploymentId:sample.deployments[0].id, attendanceDate:'2026-09-05'};
    (c as any)['save' + kind]();
    expect(a.upsertMyAttendance).not.toHaveBeenCalled();
    expect(a.upsertMyWage).not.toHaveBeenCalled();
    expect(t.error).toHaveBeenCalledWith('Period changed', expect.any(String));
  });

  it('keeps loaded deployments usable after an attendance failure', () => {
    const {c, a} = detail();
    c.ngOnChanges({assignment: {} as any});
    c.selectWagePeriod(sample.periods[1]);
    a.listMyAttendance.mockImplementationOnce(failure);
    c.setDetailTab('attendance');
    expect(c.loadError).toContain('attendance');
    c.setDetailTab('deployments');
    expect(c.loadError).toBe('');
    expect(c.loading).toBe(false);
    expect(c.deployments).toEqual(sample.deployments);
    c.ngOnDestroy();
  });

  it('does not let a slow register request hide wage periods', () => {
    const {c, a} = detail();
    c.ngOnChanges({assignment: {} as any});
    const pending = new Subject<any[]>();
    a.listMyRegisterRuns.mockReturnValue(pending);
    c.setDetailTab('registers');
    expect(c.loading).toBe(true);
    c.setDetailTab('wage-periods');
    expect(c.loading).toBe(false);
    expect(c.wagePeriods).toEqual(sample.periods);
    pending.error(new Error('offline'));
    expect(c.loadError).toBe('');
    c.ngOnDestroy();
  });

  it('cancels pending requests on component destruction', () => {
    const {c, a} = detail();
    const pending = new Subject<any[]>();
    a.listMyAttendance.mockReturnValue(pending);
    (c as any).loadAttendance();
    c.ngOnDestroy();
    expect(pending.observed).toBe(false);
  });
});
