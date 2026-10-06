import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { page } from 'vitest/browser';
import { BranchDashboardComponent } from './branch-dashboard.component';
import { AuthService } from '../../../core/auth.service';
import { ComplianceAssistantComponent } from '../../../shared/components/compliance-assistant/compliance-assistant.component';

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('Branch dashboard layout', () => {
  it.each([1630, 1280, 768, 390, 320])(
    'keeps banners and controls separated at %s pixels',
    async (width) => {
      await page.viewport(width, 1100);
      vi.spyOn(BranchDashboardComponent.prototype, 'ngOnInit').mockImplementation(() => {});
      await TestBed.configureTestingModule({
        imports: [BranchDashboardComponent],
        providers: [
          provideRouter([]),
          provideHttpClient(),
          provideHttpClientTesting(),
          {
            provide: AuthService,
            useValue: {
              hasModule: (module: string) =>
                ['EMPLOYEE_COMPLIANCE', 'PAYROLL', 'CONTRACTOR_AUDIT'].includes(module),
            },
          },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(BranchDashboardComponent);
      const c = fixture.componentInstance;
      c.loading = false;
      c.currentMonth = '2026-09';
      c.branchName = 'Sample Regional Operations';
      c.employeeTotal = 28;
      c.contractorTotal = 114;
      c.pfPending = 3;
      c.assignedBranches = ['a', 'b'];
      c.branchLabels = {
        a: 'Sample Regional Operations and Compliance Branch',
        b: 'Second Branch',
      };
      fixture.detectChanges();
      await fixture.whenStable();
      const host = fixture.nativeElement as HTMLElement;
      const banner = host.querySelector('a[href="/branch/monthly-close"]')!.parentElement!;
      const hero = host.querySelector('.dash-hero')!;
      const assistant = host.querySelector('app-compliance-assistant section')!;
      const checkLayout = () => {
        expect(
          hero.getBoundingClientRect().top - banner.getBoundingClientRect().bottom,
        ).toBeGreaterThanOrEqual(16);
        expect(banner.getBoundingClientRect().top).toBeGreaterThanOrEqual(
          assistant.getBoundingClientRect().bottom,
        );
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width + 1);
        const controls = Array.from(
          host.querySelectorAll(
            '.dash-hero__controls input, .dash-hero__controls select, .dash-hero__controls button',
          ),
        );
        for (const control of controls) {
          const box = control.getBoundingClientRect();
          const frame = hero.getBoundingClientRect();
          expect(box.left).toBeGreaterThanOrEqual(frame.left);
          expect(box.right).toBeLessThanOrEqual(frame.right);
          expect(box.top).toBeGreaterThanOrEqual(frame.top);
          expect(box.bottom).toBeLessThanOrEqual(frame.bottom);
        }
        for (let i = 0; i < controls.length; i++)
          for (let j = i + 1; j < controls.length; j++) {
            const a = controls[i].getBoundingClientRect();
            const b = controls[j].getBoundingClientRect();
            expect(
              a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
            ).toBe(true);
          }
      };
      checkLayout();
      c.assignedBranches = ['a'];
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
      await fixture.whenStable();
      checkLayout();
      if (width === 1630 || width === 390)
        await page.screenshot({
          path: `../../../../../../docs/reviews/2026-09-29/branch-dashboard-spacing-${width}.png`,
        });
      c.assignedBranches = ['a', 'b'];
      fixture.changeDetectorRef.markForCheck();
      const assistantComponent = fixture.debugElement.query(
        By.directive(ComplianceAssistantComponent),
      ).componentInstance as ComplianceAssistantComponent;
      assistantComponent.result.set({
        mode: 'RULES',
        note: 'Sample action plan',
        explanationLabel: 'Rule calculation',
        sources: [{ label: 'Compliance tasks', source: 'compliance_tasks' }],
        forecast: null,
        coverage: 'Synthetic branch scope',
        generatedAt: '',
        actions: [
          {
            id: 'sample',
            title: 'Review pending evidence',
            status: 'OPEN',
            branchName: 'Sample Branch',
            dueDate: null,
            explanation: 'Sample explanation of a pending compliance task.',
            nextAction: 'Review the supporting documents.',
            route: '/branch/tasks',
            queryParams: {},
          },
        ],
      });
      fixture.detectChanges();
      await fixture.whenStable();
      checkLayout();
      fixture.destroy();
    },
  );
});
