import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { EMPTY, of, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { ClientBranchesService } from '../../core/client-branches.service';
import { BranchComplianceItemsComponent } from '../../shared/branch-compliance/branch-compliance-items.component';
import { BranchComplianceResponse, BranchComplianceService } from '../../shared/branch-compliance/branch-compliance.service';

@Component({
  standalone: true,
  imports: [BranchComplianceItemsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<app-branch-compliance-items />',
})
class BranchHost {}

describe('Compliance schedule inside an OnPush branch layout', () => {
  let schedule: Subject<BranchComplianceResponse>;
  let branchIds: string[];
  let profile: Subject<unknown>;
  let branches: Subject<unknown[]>;
  let api: { getComplianceItems: ReturnType<typeof vi.fn> };

  const response = (month = '2026-09'): BranchComplianceResponse => ({
    branchId: 'branch-test', branchName: 'Test branch', stateCode: 'TN',
    establishmentType: 'OFFICE', month,
    items: [{ code: 'TEST', name: `Schedule ${month}`, module: 'RETURNS',
      frequency: 'MONTHLY', priority: 'HIGH', dueDate: '2026-09-15', ruleId: 'test' }],
  });

  beforeEach(() => {
    schedule = new Subject(); profile = new Subject(); branches = new Subject();
    branchIds = ['branch-test'];
    api = { getComplianceItems: vi.fn(() => schedule) };
    TestBed.configureTestingModule({
      imports: [BranchHost],
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({}) } } },
        { provide: AuthService, useValue: { getBranchIds: () => branchIds, fetchMe: () => profile } },
        { provide: ClientBranchesService, useValue: { list: () => branches } },
        { provide: BranchComplianceService, useValue: api },
      ],
    });
  });

  async function open() {
    const fixture = TestBed.createComponent(BranchHost);
    await fixture.whenStable();
    return fixture;
  }

  it('renders the first asynchronous result without a second click or forced change detection', async () => {
    const fixture = await open();
    expect(fixture.nativeElement.querySelector('[role="status"]')).not.toBeNull();
    schedule.next(response()); schedule.complete();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Schedule 2026-09');
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
  });

  it('loads once when profile branch IDs arrive after the branch list', async () => {
    branchIds = [];
    const fixture = await open();
    branches.next([]); branches.complete();
    branchIds = ['branch-test']; profile.next({}); profile.complete();
    expect(api.getComplianceItems).toHaveBeenCalledTimes(1);
    schedule.next(response()); schedule.complete();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Schedule 2026-09');
  });

  it('shows a failed load immediately and retries in place', async () => {
    const fixture = await open();
    schedule.error(new Error('unavailable'));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Failed to load');
    api.getComplianceItems.mockReturnValue(of(response()));
    fixture.nativeElement.querySelector('.retry-button').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Schedule 2026-09');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('leaves loading when branch discovery completes empty and retries discovery', async () => {
    branchIds = [];
    const fixture = await open();
    profile.complete(); branches.complete();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No branch is available');
    branchIds = ['branch-test']; api.getComplianceItems.mockReturnValue(of(response()));
    fixture.nativeElement.querySelector('.retry-button').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Schedule 2026-09');
  });

  it('shows an error when a schedule request completes without a response', async () => {
    api.getComplianceItems.mockReturnValue(EMPTY);
    const fixture = await open();
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('without a response');
  });

  it('ignores an older month response after the user selects another month', async () => {
    const fixture = await open();
    const newer = new Subject<BranchComplianceResponse>();
    api.getComplianceItems.mockReturnValue(newer);
    fixture.nativeElement.querySelector('[title="Next month"]').click();
    newer.next(response('2026-10')); newer.complete();
    schedule.next(response('2026-09')); schedule.complete();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Schedule 2026-10');
    expect(fixture.nativeElement.textContent).not.toContain('Schedule 2026-09');
  });
});
