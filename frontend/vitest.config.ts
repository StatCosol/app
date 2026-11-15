import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Browser layout and Angular component specs run in the full ng test suite.
    exclude: [
      'src/app/shared/{content-card-layout,tracker-card-layout,control-alignment,detail-pages,portal-detail-responsive,readiness-fixes,remaining-form-layout,responsive-portals}.spec.ts',
    ],
    // Vitest-native specs executed in CI via `npm run test:unit`.
    // Angular TestBed uses vitest.angular.config.ts and CLI test discovery.
    include: [
      'src/app/core/session-isolation.spec.ts',
      'src/app/pages/registration-scope-refresh.spec.ts',
      'src/app/pages/notice-selection.spec.ts',
      'src/app/pages/workflow-editor-drafts.spec.ts',
      'src/app/pages/payroll/payroll-fnf-scope.spec.ts',
      'src/app/pages/client/approvals/approval-review-state.spec.ts',
      'src/app/pages/client/performance-appraisal/appraisal-review-context.spec.ts',
      'src/app/pages/client/performance-appraisal/appraisal-list-report-state.spec.ts',
      'src/app/pages/client/performance-appraisal/appraisal-cycle-state.spec.ts',
      'src/app/pages/client/performance-appraisal/appraisal-template-state.spec.ts',
      'src/app/pages/crm/compliance/crm-reupload-backlog.component.spec.ts',
      'src/app/pages/branch/branch-reports/branch-reports.component.spec.ts',
      // Billing component TestBed specs run through ng test, not the Node runner.
      'src/app/modules/accounts-billing/services/**/*.spec.ts',
      // Pure/logic specs (utils, validators, pipes) — no Angular TestBed needed.
      'src/app/shared/**/*.spec.ts',
    ],
  },
});
