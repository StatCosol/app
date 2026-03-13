# NestJS Backend Module Inventory

Generated: 2026-03-03

---

## MODULE: access/
**FILES:** access-scope.service.ts, access.module.ts
**CONTROLLERS:** None
**SERVICES:** AccessScopeService → **implemented**, 5 methods, 299 lines
**ENTITIES:** None

---

## MODULE: admin/
**FILES:** admin-actions.controller.ts, admin-actions.service.ts, admin-approvals.controller.ts, admin-approvals.service.ts, admin-audit-logs.controller.ts, admin-digest.controller.ts, admin-digest.service.ts, admin-list.controller.ts, admin-masters.controller.ts, admin-masters.service.ts, admin-payroll-client-settings.controller.ts, admin-payroll-templates.controller.ts, admin-reports.controller.ts, admin.module.ts, dto/, entities/, helpers/, sql/
- dto/: admin-notify.dto.ts, admin-reassign.dto.ts, create-audit-category.dto.ts, create-compliance-master.dto.ts, payroll-template.dto.ts, update-audit-category.dto.ts, update-compliance-master.dto.ts
- entities/: approval-request.entity.ts
- sql/: admin-dashboard.sql.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| AdminActionsController | `@Post('notify')`, `@Post('reassign')` |
| AdminApprovalsController | `@Get()`, `@Get('counts')`, `@Post(':id/approve')`, `@Post(':id/reject')` |
| AdminAuditLogsController | `@Get()` |
| AdminDigestController | `@Post('send-now')`, `@Post('send-critical')` |
| AdminListController | `@Get('notifications/list')` |
| AdminMastersController | `@Get('compliances')`, `@Get('compliances/:id')`, `@Post('compliances')`, `@Put('compliances/:id')`, `@Delete('compliances/:id')`, `@Get('audit-categories')`, `@Post('audit-categories')`, `@Put('audit-categories/:id')`, `@Delete('audit-categories/:id')` |
| AdminPayrollClientSettingsController | `@Get(client-settings)`, `@Get(client-settings/:clientId)`, `@Post(client-settings/:clientId)` |
| AdminPayrollTemplatesController | `@Get(templates)`, `@Get(templates/:id)`, `@Post(templates)`, `@Patch(templates/:id)`, `@Post(templates/assign)`, `@Get(templates/client/:clientId)`, `@Get('runs')` |
| AdminReportsController | `@Get('user-activity')`, `@Get('user-registrations')`, `@Get('user-deletions')`, `@Get('access-logs')`, `@Get('assignments')`, `@Get('audit-reports')`, `@Get('audit-reports/summary')`, `@Get('audit-reports/:id')`, `@Post('audit-reports')`, `@Put('audit-reports/:id')`, `@Patch('audit-reports/:id/submit')`, `@Patch('audit-reports/:id/approve')`, `@Patch('audit-reports/:id/publish')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| AdminActionsService | implemented | 2 | 221 |
| AdminApprovalsService | implemented | 7 | 142 |
| AdminDigestService | implemented | 4 | 329 |
| AdminMastersService | implemented | 9 | 127 |

**ENTITIES:** ApprovalRequest → `approval_requests`

---

## MODULE: ai/
**FILES:** ai-audit.service.ts, ai-core.service.ts, ai-document-check.service.ts, ai-payroll-anomaly.service.ts, ai-query-draft.service.ts, ai-request-log.service.ts, ai-risk-cache-invalidator.service.ts, ai-risk-engine.service.ts, ai.controller.ts, ai.module.ts, dto/, entities/

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| AiController | `@Get('config')`, `@Put('config')`, `@Get('status')`, `@Post('risk/assess')`, `@Get('risk/client/:clientId')`, `@Get('risk/client/:clientId/history')`, `@Get('risk/high-risk')`, `@Get('risk/summary')`, `@Get('insights')`, `@Put('insights/:id/dismiss')`, `@Post('audit/generate-observation')`, `@Get('audit/observations')`, `@Get('audit/observations/:id')`, `@Put('audit/observations/:id/review')`, `@Post('payroll/detect-anomalies')`, `@Get('payroll/anomalies/:clientId')`, `@Get('payroll/anomaly-summary/:clientId')`, `@Put('payroll/anomalies/:id/resolve')`, `@Get('dashboard')`, `@Post('query-draft')`, `@Post('document-check/:documentId')`, `@Get('document-checks')`, `@Post('risk/branch-assess')`, `@Get('risk/branch/:branchId')`, `@Get('requests')`, `@Get('requests/:id')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| AiAuditService | implemented | 4 | 217 |
| AiCoreService | implemented | 5 | 95 |
| AiDocumentCheckService | implemented | 3 | 298 |
| AiPayrollAnomalyService | implemented | 4 | 182 |
| AiQueryDraftService | implemented | 1 | 196 |
| AiRequestLogService | implemented | 7 | 105 |
| AiRiskCacheInvalidatorService | implemented | 2 | 59 |
| AiRiskEngineService | implemented | 12 | 996 |

**ENTITIES:**
| Entity | Table |
|---|---|
| AiAuditObservation | `ai_audit_observations` |
| AiConfiguration | `ai_configurations` |
| AiDocumentAnalysis | `ai_document_analyses` |
| AiDocumentCheck | `ai_document_checks` |
| AiInsight | `ai_insights` |
| AiPayrollAnomaly | `ai_payroll_anomalies` |
| AiRequest | `ai_requests` |
| AiResponse | `ai_responses` |
| AiRiskAssessment | `ai_risk_assessments` |

---

## MODULE: assignments/
**FILES:** assignment-rotation.controller.ts, assignment-rotation.service.ts, assignments.controller.ts, assignments.module.ts, assignments.service.ts, auditor-assignment.guard.ts, crm-assignment.guard.ts, dto/, entities/

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| AssignmentRotationController | `@Post('run')` |
| AssignmentsController | `@Get('crm')`, `@Post('crm')`, `@Get('auditor')`, `@Post('auditor')`, `@Get('branch-auditors')`, `@Post('branch-auditors')`, `@Delete('branch-auditors/:id')`, `@Get()`, `@Post()`, `@Put(':clientId')`, `@Get('current')`, `@Get('history')`, `@Get('clients/:clientId/assignments/current')`, `@Get('clients/:clientId/assignments/history')`, `@Patch(':id')`, `@Delete(':clientId')`, `@Post('clients/:clientId/assignments/change')`, `@Get('assigned')`, `@Get('assigned')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| AssignmentRotationService | implemented | 6 | 267 |
| AssignmentsService | implemented | 26 | 674 |

**ENTITIES:**
| Entity | Table |
|---|---|
| BranchAuditorAssignment | `branch_auditor_assignments` |
| ClientAssignmentCurrent | `client_assignments_current` |
| ClientAssignmentHistory | `client_assignments_history` |
| ClientAssignment | `client_assignments` |

---

## MODULE: audit-logs/
**FILES:** audit-logs.module.ts, audit-logs.service.ts, entities/

**CONTROLLERS:** None
**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| AuditLogsService | implemented | 2 | 79 |

**ENTITIES:** AuditLog → `audit_logs`

---

## MODULE: auditor/
**FILES:** auditor-branches.controller.ts, auditor-dashboard.controller.ts, auditor-dashboard.service.ts, auditor-list.controller.ts, auditor.module.ts, sql/
- sql/: auditor-dashboard.sql.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| AuditorBranchesController | `@Get('branches')` |
| AuditorDashboardController | `@Get('summary')`, `@Get('audits')`, `@Get('observations')`, `@Get('reports')`, `@Get('evidence-pending')`, `@Get('activity')`, `@Post('evidence/:id/remind')`, `@Patch('evidence/:id/status')` |
| AuditorListController | `@Get('documents')`, `@Get('audits')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| AuditorDashboardService | implemented | 4 | 164 |

**ENTITIES:** None

---

## MODULE: audits/
**FILES:** auditor-observations.controller.ts, auditor-observations.service.ts, audits.controller.ts, audits.module.ts, audits.service.ts, dto/, entities/, utils/

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| AuditorObservationsController | `@Get('categories')`, `@Get()`, `@Get(':id')`, `@Post()`, `@Put(':id')`, `@Delete(':id')`, `@Get('audit/:auditId/export')` |
| AuditsController | `@Get('branch/:branchId')`, `@Get('branch/:branchId/:periodCode')`, `@Get()`, `@Get(':id')`, `@Post()`, `@Patch(':id/status')`, `@Get()`, `@Get(':id')`, `@Post(':id/score')`, `@Patch(':id/status')`, `@Get()`, `@Get('summary')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| AuditorObservationsService | implemented | 8 | 212 |
| AuditsService | implemented | 12 | 541 |

**ENTITIES:**
| Entity | Table |
|---|---|
| AuditObservationCategory | `audit_observation_categories` |
| AuditObservation | `audit_observations` |
| Audit | `audits` |

---

## MODULE: auth/
**FILES:** auth.controller.ts, auth.module.ts, auth.service.spec.ts, auth.service.ts, branch-access.service.ts, decorators/, dto/, entities/, jwt-auth.guard.ts, jwt.strategy.ts, policies/, public.decorator.ts, roles.decorator.ts, roles.guard.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| AuthController | `@Get('login')`, `@Post('login')`, `@Post('ess/login')`, `@Post('refresh')`, `@Post('logout')`, `@Post('password/request-reset')`, `@Post('password/reset')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| AuthService | implemented | 11 | 410 |
| BranchAccessService | implemented | 6 | 94 |
| AccessPolicyService | implemented | 3 | 85 |

**ENTITIES:** RefreshToken → `refresh_tokens`

---

## MODULE: branch-compliance/
**FILES:** branch-compliance-cron.service.ts, branch-compliance.module.ts, branch-compliance.service.ts, compliance-mail.service.ts, controllers/, dto/, entities/
- controllers/: admin-compliance-docs.controller.ts, auditor-compliance-docs.controller.ts, branch-compliance-docs.controller.ts, client-compliance-docs.controller.ts, crm-compliance-docs.controller.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| AdminComplianceDocsController | `@Get('return-master')`, `@Post('return-master')`, `@Patch('return-master/:returnCode')` |
| AuditorComplianceDocsController | `@Get()`, `@Get('return-master')` |
| BranchComplianceDocsController | `@Get('checklist')`, `@Get()`, `@Post('upload')`, `@Get('return-master')`, `@Get('dashboard-kpis')`, `@Get('weighted-compliance')`, `@Get('dashboard/full')`, `@Get('trend')`, `@Get('risk')`, `@Get('badges')` |
| ClientComplianceDocsController | `@Get()`, `@Get('dashboard-kpis')`, `@Get('return-master')`, `@Get('lowest-branches')`, `@Get('trend')` |
| CrmComplianceDocsController | `@Get()`, `@Patch(':id/review')`, `@Get('return-master')`, `@Get('dashboard-kpis')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| BranchComplianceCronService | implemented | 3 | 77 |
| BranchComplianceService | implemented | 25 | 946 |
| ComplianceMailService | implemented | 2 | 112 |

**ENTITIES:**
| Entity | Table |
|---|---|
| ComplianceDocument | `compliance_documents` |
| ComplianceReturnMaster | `compliance_return_master` |

---

## MODULE: branches/
**FILES:** branch-documents.controller.ts, branch-documents.service.ts, branch-list.controller.ts, branch-registration-reminder.service.ts, branch-registrations.service.ts, branch-reports.controller.ts, branches-common.controller.ts, branches.controller.spec.ts, branches.controller.ts, branches.module.ts, branches.service.spec.ts, branches.service.ts, client-branches.controller.ts, crm-branch-compliances.controller.ts, crm-branches.controller.ts, dto/, entities/

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| BranchDocumentsController | `@Get(':id/documents')`, `@Post(':id/documents/upload')`, `@Put('documents/:docId/reupload')`, `@Get(':id/mcd')`, `@Get(':id/registrations')`, `@Get(':id/registration-summary')`, `@Get('registration-summary')`, `@Get('registration-alerts')`, `@Get(':id/audit-observations')`, `@Get(':id/mcd/overview')`, `@Get()`, `@Put(':docId/review')`, `@Get()`, `@Post()`, `@Post('for-client/:clientId')`, `@Patch(':id/for-client/:clientId')`, `@Delete(':id/for-client/:clientId')`, `@Post(':id/for-client/:clientId/upload')`, `@Get('summary/:clientId')`, `@Get('alerts/:clientId')` |
| BranchListController | `@Get('mcd')`, `@Get('returns')`, `@Get('returns/yearly')`, `@Get('queries')` |
| BranchReportsController | `@Get('registration-expiry')`, `@Get('audit-observations')` |
| BranchesCommonController | `@Get()`, `@Get(':id')` |
| BranchesController | `@Post('clients/:clientId/branches')`, `@Get('clients/:clientId/branches')`, `@Get('branches/:id')`, `@Put('branches/:id')`, `@Delete('branches/:id')`, `@Post('branches/:id/restore')`, `@Get('branches/:id/contractors')`, `@Post('branches/:id/contractors')`, `@Delete('branches/:branchId/contractors/:userId')`, `@Get('branches/:id/applicable-compliances')`, `@Post('branches/:id/applicable-compliances')` |
| ClientBranchesController | `@Get()`, `@Post()`, `@Get(':id')`, `@Get(':id/dashboard')` |
| CrmBranchCompliancesController | `@Get('compliances/master')`, `@Get('branches/:branchId/applicable-compliances')`, `@Post('branches/:branchId/applicable-compliances')` |
| CrmBranchesController | `@Get('clients/:clientId/branches')`, `@Post('clients/:clientId/branches')`, `@Get('branches/:id/compliances')`, `@Post('branches/:id/compliances')`, `@Patch('branches/:id')`, `@Delete('branches/:id')`, `@Get('branches/:id/contractors')`, `@Post('branches/:id/contractors')`, `@Delete('branches/:branchId/contractors/:userId')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| BranchDocumentsService | implemented | 7 | 289 |
| BranchRegistrationReminderService | implemented | 1 | 188 |
| BranchRegistrationsService | implemented | 10 | 325 |
| BranchesService | implemented | 16 | 556 |

**ENTITIES:**
| Entity | Table |
|---|---|
| BranchApplicableCompliance | `branch_applicable_compliances` |
| BranchContractor | `branch_contractor` |
| BranchDocument | `branch_documents` |
| BranchRegistration | `branch_registrations` |
| Branch | `client_branches` |
| RegistrationAlert | `registration_alerts` |

---

## MODULE: calendar/
**FILES:** calendar.controller.ts, calendar.module.ts, calendar.service.ts, dto/

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| CalendarController | `@Get()` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| CalendarService | implemented | 3 | 299 |

**ENTITIES:** None

---

## MODULE: cco/
**FILES:** cco-list.controller.ts, cco.controller.ts, cco.module.ts, cco.service.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| CcoListController | `@Get('escalations')` |
| CcoController | `@Get('dashboard')`, `@Get('approvals')`, `@Post('approvals/:id/approve')`, `@Post('approvals/:id/reject')`, `@Get('crms-under-me')`, `@Get('oversight')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| CcoService | implemented | 6 | 256 |

**ENTITIES:** None

---

## MODULE: ceo/
**FILES:** ceo-dashboard.controller.ts, ceo-dashboard.service.ts, ceo-list.controller.ts, ceo.controller.ts, ceo.module.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| CeoDashboardController | `@Get('summary')`, `@Get('client-overview')`, `@Get('cco-crm-performance')`, `@Get('governance-compliance')`, `@Get('recent-escalations')`, `@Get('compliance-trend')` |
| CeoListController | `@Get('branches')`, `@Get('audits')`, `@Get('escalations')` |
| CeoController | `@Get('dashboard')`, `@Get('approvals')`, `@Get('approvals/:id')`, `@Post('approvals/:id/approve')`, `@Post('approvals/:id/reject')`, `@Get('escalations')`, `@Get('escalations/:id')`, `@Post('escalations/:id/comment')`, `@Post('escalations/:id/assign-to-cco')`, `@Post('escalations/:id/close')`, `@Get('oversight/cco-summary')`, `@Get('oversight/cco/:ccoId/items')`, `@Get('notifications')`, `@Post('notifications/:id/read')`, `@Get('reports')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| CeoDashboardService | implemented | 6 | 235 |

**ENTITIES:** None

---

## MODULE: checklists/ ⚠️ STUB
**FILES:** checklists.controller.spec.ts, checklists.controller.ts, checklists.module.ts, checklists.service.spec.ts, checklists.service.ts, entities/

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| ChecklistsController | **NONE — empty class** |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| ChecklistsService | **STUB — empty class, 0 methods** | 0 | 5 |

**ENTITIES:** BranchCompliance → `branch_compliances`

> **⚠️ FLAG: Fully stub module. Controller has no routes, service has no methods.**

---

## MODULE: client-dashboard/
**FILES:** client-dashboard.controller.ts, client-dashboard.module.ts, client-dashboard.service.spec.ts, client-dashboard.service.ts, dto/

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| ClientDashboardController | `@Get('pf-esi-summary')`, `@Get('contractor-upload-summary')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| ClientDashboardService | implemented | 3 | 286 |

**ENTITIES:** None

---

## MODULE: clients/
**FILES:** admin-clients.controller.ts, cco-clients.controller.ts, client-list.controller.ts, client.controller.ts, clients.controller.spec.ts, clients.controller.ts, clients.module.ts, clients.service.spec.ts, clients.service.ts, dto/, entities/

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| AdminClientsController | `@Get('clients')`, `@Get('clients/with-aggregates')`, `@Get('clients/:id')`, `@Post('clients')`, `@Put('clients/:id')`, `@Get('clients/:id/readiness')`, `@Delete('clients/:id')`, `@Post('clients/:id/restore')`, `@Get('client-users-with-client')`, `@Get('clients/:id/users')`, `@Post('clients/:id/users')`, `@Delete('clients/:clientId/users/:userId')`, `@Post('clients/:id/logo')` |
| CcoClientsController | `@Get()`, `@Get(':id')`, `@Post()`, `@Patch(':id/assign')` |
| ClientListController | `@Get('compliance/branch-wise')`, `@Get('returns')`, `@Get('audits')`, `@Get('documents')`, `@Get('queries')` |
| ClientController | `@Get('me')` |
| ClientsController | `@Get('list-with-aggregates')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| ClientsService | implemented | 18 | 713 |

**ENTITIES:**
| Entity | Table |
|---|---|
| ClientUser | `client_users` |
| Client | `clients` |

---

## MODULE: common/
**FILES:** db/ (db.service.ts, paginate-qb.ts), dto/ (list-query.dto.ts, period-query.dto.ts, scoped-list-query.dto.ts), enums.ts, types/ (page.type.ts), upload-validation.ts, utils/ (enums.ts, filters.ts)

**CONTROLLERS:** None
**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| DbService | implemented | 3 | 46 |

**ENTITIES:** None

> Shared utility module, no controllers.

---

## MODULE: compliance/
**FILES:** compliance-cron.service.ts, compliance.module.ts, compliance.service.ts, controllers/, dto/, entities/
- controllers/: admin-compliance.controller.ts, auditor-compliance.controller.ts, branch-reupload.controller.ts, client-compliance.controller.ts, common-compliance.controller.ts, contractor-compliance.controller.ts, crm-compliance.controller.ts, dashboard.controller.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| AdminComplianceController | `@Get('tasks')` |
| AuditorComplianceController | `@Get()`, `@Get('tasks')`, `@Get('tasks/:id')`, `@Get('docs')`, `@Post('reupload-requests')`, `@Get('reupload-requests')`, `@Post('reupload-requests/:id/approve')`, `@Post('reupload-requests/:id/reject')` |
| BranchReuploadController | `@Get('reupload-requests')`, `@Post('reupload-requests/:id/upload')`, `@Post('reupload-requests/:id/submit')` |
| ClientComplianceController | `@Get('tasks')`, `@Get('tasks/:id/items')`, `@Post('tasks/:id/evidence')`, `@Post('tasks/:id/submit')`, `@Get('reupload-requests')`, `@Post('reupload-requests/:id/upload')`, `@Post('reupload-requests/:id/submit')` |
| CommonComplianceController | `@Get('master')` |
| ContractorComplianceController | `@Get('tasks')`, `@Get('tasks/:id')`, `@Post('tasks/:id/start')`, `@Post('tasks/:id/submit')`, `@Post('tasks/:id/comment')`, `@Post('tasks/:id/evidence')`, `@Get('reupload-requests')`, `@Get('docs/:docId/remarks')`, `@Post('reupload-requests/:id/upload')`, `@Post('reupload-requests/:id/submit')` |
| CrmComplianceController | `@Get('tasks/kpis')`, `@Post('tasks/bulk-approve')`, `@Post('tasks/bulk-reject')`, `@Post('tasks')`, `@Get('tasks')`, `@Get('tasks/:id')`, `@Patch('tasks/:id/assign')`, `@Post('tasks/:id/approve')`, `@Post('tasks/:id/reject')` |
| DashboardController | `@Get()` ×5 (role-based) |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| ComplianceCronService | implemented | 6 | 502 |
| ComplianceService | **implemented (LARGEST)** | 56 | 2835 |

**ENTITIES:**
| Entity | Table |
|---|---|
| ComplianceComment | `compliance_comments` |
| ComplianceEvidence | `compliance_evidence` |
| ComplianceMcdItem | `compliance_mcd_items` |
| ComplianceTask | `compliance_tasks` |
| DocumentRemark | `document_remarks` |
| DocumentReuploadRequest | `document_reupload_requests` |
| DocumentVersion | `document_versions` |

---

## MODULE: compliance-documents/
**FILES:** admin-compliance-docs.controller.ts, client-compliance-docs.controller.ts, compliance-documents.module.ts, compliance-documents.service.ts, crm-compliance-docs.controller.ts, dto/, entities/

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| AdminComplianceDocsController | `@Post('upload')`, `@Get()`, `@Get('categories')`, `@Get('categories/:category/sub')`, `@Get(':id/download')`, `@Delete(':id')` |
| ClientComplianceDocsController | `@Get()`, `@Get('categories')`, `@Get('categories/:category/sub')`, `@Get(':id/download')`, `@Get('settings')`, `@Post('settings')` |
| CrmComplianceDocsController | `@Post('upload')`, `@Get()`, `@Get('categories')`, `@Get('categories/:category/sub')`, `@Get(':id/download')`, `@Delete(':id')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| ComplianceDocumentsService | implemented | 10 | 382 |

**ENTITIES:**
| Entity | Table |
|---|---|
| CompanySettings | `company_settings` |
| ComplianceDocumentVisibility | `compliance_document_visibility` |
| ComplianceDocument (lib) | `compliance_doc_library` |

---

## MODULE: compliances/
**FILES:** branch-compliance-override.controller.ts, branch-compliance-override.service.ts, branch-compliance-recompute.controller.ts, branch-compliance.controller.ts, compliance-applicability.service.ts, compliance-metrics.controller.ts, compliance-metrics.service.ts, compliances.controller.spec.ts, compliances.controller.ts, compliances.module.ts, compliances.service.spec.ts, compliances.service.ts, crm-compliance.controller.ts, entities/, risk-monitor-cron.service.ts, sla-compliance-resolver.service.ts, sla-compliance-schedule.service.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| BranchComplianceOverrideController | `@Post('override')` |
| BranchComplianceRecomputeController | `@Get(':branchId/compliances/recompute')` |
| BranchComplianceController | `@Get(':branchId/compliance-items')` |
| ComplianceMetricsController | `@Get('completion')`, `@Get('completion-trend')`, `@Get('risk-score')`, `@Get('risk-ranking')`, `@Get('risk-heatmap')`, `@Get('lowest-branches')`, `@Get('action-plan')`, `@Get('risk-forecast')`, `@Get('summary')`, `@Get('benchmark')`, `@Post('simulate-risk')`, `@Get('export-pack')` |
| CompliancesController | `@Get('compliances')`, `@Get('branches/:branchId/compliances')`, `@Post('branches/:branchId/compliances')`, `@Post('branches/:branchId/compliances/recompute')` |
| CrmComplianceController | `@Get()` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| BranchComplianceOverrideService | implemented | 1 | 80 |
| ComplianceApplicabilityService | implemented | 3 | 208 |
| ComplianceMetricsService | implemented | 15 | 953 |
| CompliancesService | implemented | 7 | 391 |
| RiskMonitorCronService | implemented | 5 | 441 |
| SlaComplianceResolverService | implemented | 1 | 124 |
| SlaComplianceScheduleService | implemented | 0 (cron-based) | 135 |

**ENTITIES:**
| Entity | Table |
|---|---|
| ComplianceApplicability | `compliance_applicability` |
| ComplianceItem | `sla_compliance_items` |
| ComplianceMaster | `compliance_master` |
| ComplianceRule | `sla_compliance_rules` |

---

## MODULE: config/
**FILES:** env.validation.ts

**CONTROLLERS:** None
**SERVICES:** None
**ENTITIES:** None

> Configuration-only module (environment validation).

---

## MODULE: contractor/
**FILES:** client-contractors.controller.ts, contractor-dashboard.service.ts, contractor-documents.controller.ts, contractor-documents.service.ts, contractor-list.controller.ts, contractor-required-documents.controller.ts, contractor-required-documents.service.ts, contractor.controller.ts, contractor.module.ts, contractor.service.ts, crm-contractor-registration.controller.ts, crm-contractor-registration.service.ts, entities/

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| ClientContractorsController | `@Get()`, `@Get('documents')`, `@Get('dashboard')`, `@Get('dashboard/branch/:branchId')`, `@Get('dashboard/contractor/:contractorId')` |
| ContractorDocumentsController | `@Get()`, `@Post('upload')`, `@Post('reupload/:id')`, `@Get()`, `@Post(':id/review')` |
| ContractorListController | `@Get('documents')`, `@Get('queries')` |
| ContractorRequiredDocumentsController | `@Get()`, `@Get('by-client')`, `@Post()`, `@Post('bulk')`, `@Patch(':id/toggle')`, `@Delete(':id')`, `@Get()`, `@Get('all')`, `@Post()`, `@Post('bulk')`, `@Patch(':id/toggle')`, `@Delete(':id')` |
| ContractorController | `@Get('dashboard')`, `@Get('score-trend')`, `@Get('links')`, `@Get(':contractorId/branches')`, `@Put(':contractorId/branches')`, `@Post(':contractorId/branches')`, `@Delete(':contractorId/branches/:branchId')` |
| CrmContractorRegistrationController | `@Post('register')`, `@Get('my-contractors')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| ContractorDashboardService | implemented | 9 | 680 |
| ContractorDocumentsService | implemented | 5 | 298 |
| ContractorRequiredDocumentsService | implemented | 6 | 148 |
| ContractorService | implemented | 12 | 605 |
| CrmContractorRegistrationService | implemented | 2 | 149 |

**ENTITIES:**
| Entity | Table |
|---|---|
| ContractorDocument | `contractor_documents` |
| ContractorRequiredDocument | `contractor_required_documents` |

---

## MODULE: crm/
**FILES:** crm-compliance-tracker.controller.ts, crm-contractor-documents.controller.ts, crm-dashboard.controller.ts, crm-dashboard.service.ts, crm-list.controller.ts, crm.module.ts, sql/

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| CrmComplianceTrackerController | `@Get('mcd')`, `@Post('mcd/:branchId/finalize')`, `@Post('mcd/:branchId/return')`, `@Post('mcd/:branchId/lock')`, `@Get('reupload-backlog')`, `@Get('reupload-requests')`, `@Get('reupload-top-units')`, `@Get('audit-closures')`, `@Post('audit-closures/:observationId/close')` |
| CrmContractorDocumentsController | `@Get('kpis')`, `@Get()`, `@Post(':id/review')` |
| CrmDashboardController | `@Get('summary')`, `@Get('due-compliances')`, `@Get('low-coverage-branches')`, `@Get('queries')`, `@Get('pending-documents')`, `@Get('kpis')`, `@Get('priority-today')`, `@Get('top-risk-clients')`, `@Get('upcoming-audits')` |
| CrmListController | `@Get('tasks')`, `@Get('due-items')`, `@Get('documents/review')`, `@Get('mcd')`, `@Get('queries')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| CrmDashboardService | implemented | 9 | 222 |

**ENTITIES:** None

---

## MODULE: crm-documents/
**FILES:** controllers/ (branch-unit-documents.controller.ts, client-unit-documents.controller.ts, crm-unit-documents.controller.ts), crm-documents.module.ts, crm-documents.service.ts, dto/, entities/

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| BranchUnitDocumentsController | `@Get()`, `@Get(':id/download')` |
| ClientUnitDocumentsController | `@Get()`, `@Get(':id/download')` |
| CrmUnitDocumentsController | `@Post('upload')`, `@Get()`, `@Get(':id/download')`, `@Delete(':id')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| CrmDocumentsService | implemented | 9 | 313 |

**ENTITIES:** CrmUnitDocument → `crm_unit_documents`

---

## MODULE: dashboard/
**FILES:** admin-dashboard.controller.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| AdminDashboardController | `@Get()`, `@Get('states')`, `@Get('clients-minimal')`, `@Get('summary')`, `@Get('escalations')`, `@Get('assignments-attention')`, `@Get('task-status')`, `@Get('sla-trend')`, `@Get('stats')`, `@Get('crm-load')`, `@Get('auditor-load')`, `@Get('attention')`, `@Get('assignment-summary')`, `@Get('unassigned-clients')`, `@Get('audit-summary')`, `@Get('risk-alerts')` |

**SERVICES:** None (uses DataSource directly in controller)
**ENTITIES:** None

> Note: Controller injects DataSource directly, no service layer.

---

## MODULE: email/
**FILES:** email.module.ts, email.service.ts, email.templates.ts

**CONTROLLERS:** None
**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| EmailService | implemented | 1 | 63 |

**ENTITIES:** None

---

## MODULE: employees/
**FILES:** employees.controller.ts, employees.module.ts, employees.service.ts, entities/

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| EmployeesController | `@Post()`, `@Get()`, `@Get(':id')`, `@Put(':id')`, `@Put(':id/deactivate')`, `@Post(':id/provision-ess')`, `@Post(':id/nominations')`, `@Get(':id/nominations')`, `@Post(':id/forms/generate')`, `@Get(':id/forms')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| EmployeesService | implemented | 11 | 254 |

**ENTITIES:**
| Entity | Table |
|---|---|
| EmployeeGeneratedForm | `employee_generated_forms` |
| EmployeeNominationMember | `employee_nomination_members` |
| EmployeeNomination | `employee_nominations` |
| EmployeeSequence | `employee_sequence` |
| EmployeeStatutory | `employee_statutory` |
| Employee | `employees` |

---

## MODULE: escalations/
**FILES:** entities/, escalation-cron.service.ts, escalations.controller.ts, escalations.module.ts, escalations.service.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| EscalationsController | `@Get()`, `@Patch(':id')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| EscalationCronService | implemented | 1 | 91 |
| EscalationsService | implemented | 3 | 98 |

**ENTITIES:** Escalation → `escalations`

> **⚠️ FLAG: Minimal CRUD — no Create/Delete endpoints. Only Get + Patch.**

---

## MODULE: ess/
**FILES:** entities/, ess.controller.ts, ess.module.ts, ess.service.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| EssController | `@Get('company')`, `@Get('profile')`, `@Get('statutory')`, `@Get('contributions')`, `@Get('nominations')`, `@Post('nominations')`, `@Put('nominations/:id/submit')`, `@Put('nominations/:id/resubmit')`, `@Get('leave/balances')`, `@Get('leave/policies')`, `@Get('leave/applications')`, `@Post('leave/apply')`, `@Put('leave/:id/cancel')`, `@Get('payslips')`, `@Get('payslips/:id/download')`, `@Get('nominations')` (mgr), `@Put('nominations/:id/approve')`, `@Put('nominations/:id/reject')`, `@Get('leaves')`, `@Put('leaves/:id/approve')`, `@Put('leaves/:id/reject')`, `@Get('policies')`, `@Post('policies')`, `@Put('policies/:id')`, `@Post('seed-defaults')`, `@Post('initialize-balances')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| EssService | implemented | 26 | 777 |

**ENTITIES:**
| Entity | Table |
|---|---|
| LeaveApplication | `leave_applications` |
| LeaveBalance | `leave_balances` |
| LeaveLedger | `leave_ledger` |
| LeavePolicy | `leave_policies` |

---

## MODULE: files/
**FILES:** files.controller.ts, files.module.ts, files.service.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| FilesController | `@Get('download')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| FilesService | implemented | 1 | 83 |

**ENTITIES:** None

> **⚠️ FLAG: Download-only. No upload endpoint in this controller (uploads handled elsewhere).**

---

## MODULE: health/
**FILES:** health.controller.ts, health.module.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| HealthController | `@Get()` |

**SERVICES:** None (uses DataSource directly)
**ENTITIES:** None

---

## MODULE: helpdesk/
**FILES:** entities/, helpdesk.controller.ts, helpdesk.module.ts, helpdesk.service.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| HelpdeskController | `@Get('tickets')`, `@Get('tickets/:ticketId')`, `@Get('tickets')`, `@Post('tickets')`, `@Get('tickets/:ticketId')`, `@Get('tickets')`, `@Get('tickets/:ticketId')`, `@Post('messages')`, `@Post('files')`, `@Get('messages')`, `@Get('tickets')`, `@Patch('tickets/:id/status')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| HelpdeskService | implemented | 13 | 322 |

**ENTITIES:**
| Entity | Table |
|---|---|
| HelpdeskMessageFile | `helpdesk_message_files` |
| HelpdeskMessage | `helpdesk_messages` |
| HelpdeskTicket | `helpdesk_tickets` |

---

## MODULE: legitx/
**FILES:** dto/, legitx-compliance-status.controller.ts, legitx-compliance-status.service.ts, legitx-compliance-status.types.ts, legitx-compliance.controller.ts, legitx-compliance.service.ts, legitx-dashboard.controller.ts, legitx-dashboard.service.ts, legitx-dashboard.types.ts, legitx.module.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| LegitxComplianceStatusController | `@Get('summary')`, `@Get('branches')`, `@Get('tasks')`, `@Get('contractors')`, `@Get('audit')`, `@Get('returns')` |
| LegitxComplianceController | `@Get('compliance-status')`, `@Get('mcd')`, `@Get('returns')`, `@Get('returns/:id/download')`, `@Get('audits')`, `@Get('audits/:auditId/report/download')`, `@Get('audits/:auditId/observations')` |
| LegitxDashboardController | `@Get()`, `@Get('summary')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| LegitxComplianceStatusService | implemented | 10 | 671 |
| LegitxComplianceService | implemented | 7 | 506 |
| LegitxDashboardService | implemented | 16 | 879 |

**ENTITIES:** None (uses entities from other modules)

---

## MODULE: list-queries/
**FILES:** audit-list.service.ts, doc-list.service.ts, employee-list.service.ts, escalation-list.service.ts, list-queries.module.ts, return-list.service.ts, task-list.service.ts, thread-list.service.ts

**CONTROLLERS:** None
**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| AuditListService | implemented | 1 | 64 |
| DocListService | implemented | 2 | 124 |
| EmployeeListService | implemented | 2 | 96 |
| EscalationListService | implemented | 1 | 63 |
| ReturnListService | implemented | 1 | 95 |
| TaskListService | implemented | 2 | 134 |
| ThreadListService | implemented | 2 | 113 |

**ENTITIES:** None

> Shared query-building services used by list controllers across modules.

---

## MODULE: monthly-documents/
**FILES:** dto/, entities/, monthly-documents.controller.ts, monthly-documents.module.ts, monthly-documents.service.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| MonthlyDocumentsController | `@Get()`, `@Post('upload')`, `@Delete(':id')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| MonthlyDocumentsService | implemented | 3 | 137 |

**ENTITIES:** MonthlyComplianceUpload → `monthly_compliance_uploads`

---

## MODULE: nominations/
**FILES:** dto/, nominations.controller.ts, nominations.module.ts, nominations.service.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| NominationsController | `@Post('save')`, `@Get()`, `@Get('all')`, `@Get('forms')`, `@Post('generate')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| NominationsService | implemented | 6 | 337 |

**ENTITIES:** None (uses Employee entities)

---

## MODULE: notifications/
**FILES:** admin-notifications.controller.ts, dto/, entities/, notifications-inbox.controller.ts, notifications-inbox.service.ts, notifications.controller.ts, notifications.module.ts, notifications.service.ts, sql/

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| AdminNotificationsController | `@Get()`, `@Get(':id')`, `@Post()`, `@Post(':id/reply')`, `@Post(':id/read')`, `@Patch(':id/status')` |
| NotificationsInboxController | `@Get('list')`, `@Get(':id')`, `@Patch(':id/status')` |
| NotificationsController | `@Post()`, `@Get('inbox')`, `@Get('my')`, `@Get('threads/:threadId')`, `@Post('threads/:threadId/reply')`, `@Post('threads/:threadId/close')`, `@Post('threads/:threadId/reopen')`, `@Post('threads/:threadId/read')`, `@Post('raise')`, `@Post(':id/reply')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| NotificationsInboxService | implemented | 3 | 122 |
| NotificationsService | implemented | 21 | 747 |

**ENTITIES:**
| Entity | Table |
|---|---|
| NotificationMessage | `notification_messages` |
| NotificationRead | `notification_reads` |
| NotificationThread | `notification_threads` |
| Notification | `notifications` |

---

## MODULE: options/
**FILES:** admin-options.controller.ts, auditor-options.controller.ts, branch-options.controller.ts, client-options.controller.ts, crm-options.controller.ts, options.module.ts, paydek-options.controller.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| AdminOptionsController | `@Get('clients')`, `@Get('branches')` |
| AuditorOptionsController | `@Get('clients')`, `@Get('branches')` |
| BranchOptionsController | `@Get('self')` |
| ClientOptionsController | `@Get('branches')` |
| CrmOptionsController | `@Get('clients')`, `@Get('branches')` |
| PaydekOptionsController | `@Get('clients')`, `@Get('branches')` |

**SERVICES:** None (uses DataSource directly in controllers)
**ENTITIES:** None

---

## MODULE: payroll/
**FILES:** constants/, dto/, entities/, generators/, paydek-list.controller.ts, payroll-assignments.admin.controller.ts, payroll-processing.controller.ts, payroll-processing.service.ts, payroll-setup.controller.ts, payroll-setup.service.ts, payroll.config.controller.ts, payroll.controller.ts, payroll.module.ts, payroll.service.ts, services/ (state-slab.service.ts, state-statutory.service.ts, statutory-calculator.service.ts), utils/

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| PaydekListController | `@Get('employees')`, `@Get('pf-esi/pending')`, `@Get('queries')` |
| PayrollAssignmentsAdminController | `@Get(':clientId')`, `@Post()`, `@Delete(':clientId')` |
| PayrollProcessingController | `@Post(':runId/upload-breakup')`, `@Post(':runId/process')`, `@Post(':runId/generate/pf-ecr')`, `@Post(':runId/generate/esi')`, `@Post(':runId/generate/registers')`, `@Get('register-templates')` |
| PayrollSetupController | `@Get(':clientId')`, `@Post(':clientId')`, `@Get(':clientId/components')`, `@Post(':clientId/components')`, `@Put(':clientId/components/:componentId')`, `@Delete(':clientId/components/:componentId')`, `@Get(':clientId/components/:componentId/rules')`, `@Post(':clientId/components/:componentId/rules')`, `@Put(':clientId/components/:componentId/rules/:ruleId')`, `@Delete(':clientId/components/:componentId/rules/:ruleId')`, `@Get(':clientId/components/:componentId/rules/:ruleId/slabs')`, `@Post(':clientId/components/:componentId/rules/:ruleId/slabs')`, `@Get()`, `@Get('components')` |
| PayrollConfigController | `@Get(':clientId/components-effective')`, `@Post(':clientId/component-overrides')`, `@Get(':clientId/payslip-layout')`, `@Post(':clientId/payslip-layout')` |
| PayrollController | `@Get('summary')`, `@Get('dashboard')`, `@Get('pf-esi-summary')`, `@Get('employees')`, `@Get('employees/:employeeId')`, `@Get('clients')`, `@Get('templates')`, `@Get('payslips')`, `@Get('registers-records')`, `@Get('registers')`, `@Get('registers/:id/download')`, `@Get('registers-records/:id/download')`, `@Patch('registers/:id/approve')`, `@Patch('registers/:id/reject')`, `@Get('runs')`, `@Post('runs')`, `@Post('runs/:runId/employees/upload')`, `@Get('runs/:runId/employees')`, `@Get('runs/:runId/employees/:employeeId/payslip.pdf')`, `@Get('runs/:runId/employees/:employeeId/payslip.archived.pdf')`, `@Post('runs/:runId/payslips/archive')`, `@Get('runs/:runId/payslips.zip')`, `@Get('inputs/:id/files')`, `@Patch('inputs/:id/status')`, `@Get('inputs/files/:id/download')`, `@Post('clients/:clientId/template')`, `@Get('clients/:clientId/template')`, `@Get('clients/:clientId/template/download')`, `@Get('queries')`, `@Get('queries/:queryId')`, `@Post('queries')`, `@Post('queries/:queryId/messages')`, `@Patch('queries/:queryId/resolve')`, `@Patch('queries/:queryId/status')`, `@Get('fnf')`, `@Get('fnf/:fnfId')`, `@Post('fnf')`, `@Patch('fnf/:fnfId/status')`, `@Get()`, `@Post()`, `@Patch(':id/status')`, `@Get(':id/status-history')`, `@Post(':id/files')`, `@Get(':id/files')`, `@Get('files/:id/download')`, `@Get()`, `@Get('download')`, `@Get()`, `@Post()`, `@Get(':id/download')`, `@Get(':clientId')`, `@Post(':clientId')`, `@Get(':clientId')`, `@Post(':clientId')`, `@Get()`, `@Post()`, `@Get()`, `@Get(':id/download')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| PayrollProcessingService | implemented | 4 | 509 |
| PayrollSetupService | implemented | 12 | 159 |
| PayrollService | **implemented (2nd LARGEST)** | 63 | 2543 |
| StateSlabService | implemented | 1 | 66 |
| StateStatutoryService | implemented | 1 | 61 |
| StatutoryCalculatorService | implemented | 0 (utility) | 97 |

**ENTITIES:**
| Entity | Table |
|---|---|
| PayrollClientAssignment | `payroll_client_assignments` |
| PayrollClientComponentOverride | `payroll_client_component_overrides` |
| PayrollClientPayslipLayout | `payroll_client_payslip_layout` |
| PayrollClientSettings | `payroll_client_settings` |
| PayrollClientSetup | `payroll_client_setup` |
| PayrollClientTemplate | `payroll_client_template` |
| PayrollComponentMaster | `payroll_component_master` |
| PayrollComponentRule | `payroll_component_rules` |
| PayrollComponentSlab | `payroll_component_slabs` |
| PayrollComponent | `payroll_components` |
| PayrollFnf | `payroll_fnf` |
| PayrollInputFile | `payroll_input_files` |
| PayrollInputStatusHistory | `payroll_input_status_history` |
| PayrollInput | `payroll_inputs` |
| PayrollPayslipArchive | `payroll_payslip_archives` |
| PayrollQueryMessage | `payroll_query_messages` |
| PayrollQuery | `payroll_queries` |
| PayrollRunComponentValue | `payroll_run_component_values` |
| PayrollRunEmployee | `payroll_run_employees` |
| PayrollRunItem | `payroll_run_items` |
| PayrollRun | `payroll_runs` |
| PayrollStatutorySlab | `payroll_statutory_slabs` |
| PayrollTemplateComponent | `payroll_template_components` |
| PayrollTemplate | `payroll_templates` |
| RegisterTemplate | `register_templates` |
| RegistersRecord | `registers_records` |

---

## MODULE: reports/
**FILES:** assignment-report.controller.ts, audit-report.controller.ts, compliance-report.controller.ts, report-export.controller.ts, report-export.service.ts, reports.controller.ts, reports.module.ts, reports.service.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| AssignmentReportController | `@Get('health')` |
| AuditReportController | `@Get('overdue')` |
| ComplianceReportController | `@Get()` |
| ReportExportController | `@Get('compliance.xlsx')`, `@Get('audits-overdue.xlsx')`, `@Get('assignments-health.xlsx')` |
| ReportsController | `@Get()`, `@Get('compliance-summary')`, `@Get('overdue')`, `@Get('contractor-performance')`, `@Get('overdue/export')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| ReportExportService | implemented | 4 | 141 |
| ReportsService | implemented | 4 | 362 |

**ENTITIES:** None

---

## MODULE: returns/
**FILES:** admin-returns.controller.ts, auditor-returns.controller.ts, client-returns.controller.ts, crm-returns.controller.ts, dto/, entities/, returns.module.ts, returns.service.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| AdminReturnsController | `@Get('filings')`, `@Get('types')`, `@Patch('filings/:id/status')`, `@Patch('filings/:id/delete')`, `@Patch('filings/:id/restore')` |
| AuditorReturnsController | `@Get('filings')`, `@Patch('filings/:id/status')` |
| ClientReturnsController | `@Get('filings')`, `@Get('types')`, `@Post('filings')`, `@Post('filings/:id/ack')`, `@Post('filings/:id/challan')`, `@Post('filings/:id/submit')` |
| CrmReturnsController | `@Get('filings')`, `@Get('types')`, `@Patch('filings/:id/status')`, `@Post('filings/:id/ack')`, `@Post('filings/:id/challan')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| ReturnsService | implemented | 14 | 360 |

**ENTITIES:** ComplianceReturn → `compliance_returns`

---

## MODULE: risk/
**FILES:** risk-snapshot-cron.service.ts, risk.controller.ts, risk.module.ts, risk.service.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| RiskController | `@Get('heatmap')`, `@Get('trend')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| RiskSnapshotCronService | implemented | 1 | 52 |
| RiskService | implemented | 3 | 146 |

**ENTITIES:** None

> **⚠️ FLAG: Read-only endpoints. No Create/Update/Delete for risk data.**

---

## MODULE: sla/
**FILES:** entities/, sla-autogen-cron.service.ts, sla.controller.ts, sla.module.ts, sla.service.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| SlaController | `@Get('tasks')`, `@Patch('tasks/:id')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| SlaAutogenCronService | implemented | 5 | 258 |
| SlaService | implemented | 2 | 82 |

**ENTITIES:** SlaTask → `sla_tasks`

> **⚠️ FLAG: Minimal — only Get + Patch. No Delete endpoint.**

---

## MODULE: users/
**FILES:** approvals.controller.ts, cco-users.controller.ts, crm-users.controller.ts, dto/, entities/, me.controller.ts, users.controller.ts, users.module.ts, users.service.ts

**CONTROLLERS:**
| Controller | Endpoints |
|---|---|
| ApprovalsController | `@Get('pending')`, `@Post(':id/approve')`, `@Post(':id/reject')` |
| CcoUsersController | `@Get('crms')`, `@Get('auditors')` |
| CrmUsersController | `@Get('auditors')`, `@Get('contractors')` |
| MeController | `@Get()`, `@Patch('profile')`, `@Patch('password')` |
| UsersController | `@Get('users/cco')`, `@Get('users/active-by-role/:role')`, `@Post('users/reset-ceo-password')`, `@Get('roles')`, `@Get('roles/:id')`, `@Get('auditors')`, `@Get('users')`, `@Get('users/list')`, `@Get('users/export')`, `@Get('client-users')`, `@Get('users/directory')`, `@Post('users')`, `@Put('users/:id')`, `@Post('users/:id/reset-password')`, `@Delete('users/:id')`, `@Patch('users/:id/status')` |

**SERVICES:**
| Service | Status | Methods | Lines |
|---|---|---|---|
| UsersService | implemented | 40 | 1714 |

**ENTITIES:**
| Entity | Table |
|---|---|
| Approval | `approvals` |
| DeletionRequest | `deletion_requests` |
| Role | `roles` |
| User | `users` |

---

# SUMMARY — FLAGS & ISSUES

## Fully Stub Modules (no implementation)
| Module | Issue |
|---|---|
| **checklists/** | Controller + Service both empty classes. Entity exists but unused. |

## Modules With No Service Layer (raw SQL in controller)
| Module | Issue |
|---|---|
| **dashboard/** | AdminDashboardController uses DataSource directly; no service. |
| **health/** | HealthController uses DataSource directly (acceptable for health check). |
| **options/** | All 6 option controllers use DataSource directly; no service. |

## Modules With No Controllers
| Module | Purpose |
|---|---|
| **access/** | Internal service only (access scoping) |
| **audit-logs/** | Internal service only (logging) |
| **common/** | Shared utilities, DTOs, enums |
| **config/** | Environment validation only |
| **email/** | Internal service only (email sending) |
| **list-queries/** | Shared query services consumed by controllers in other modules |

## Minimal CRUD Gaps
| Module | Missing |
|---|---|
| **escalations/** | No Create or Delete endpoints (only Get + Patch) |
| **risk/** | Read-only (heatmap + trend); no write endpoints |
| **sla/** | No Create or Delete endpoints (only Get tasks + Patch) |
| **files/** | Download-only; no upload endpoint in this module |
| **calendar/** | Read-only (single Get endpoint) |

## Largest Services (by line count)
1. **compliance/compliance.service.ts** — 2835 lines, 56 methods
2. **payroll/payroll.service.ts** — 2543 lines, 63 methods
3. **users/users.service.ts** — 1714 lines, 40 methods
4. **ai/ai-risk-engine.service.ts** — 996 lines, 12 methods
5. **compliances/compliance-metrics.service.ts** — 953 lines, 15 methods
6. **branch-compliance/branch-compliance.service.ts** — 946 lines, 25 methods
7. **legitx/legitx-dashboard.service.ts** — 879 lines, 16 methods
8. **ess/ess.service.ts** — 777 lines, 26 methods
9. **notifications/notifications.service.ts** — 747 lines, 21 methods
10. **clients/clients.service.ts** — 713 lines, 18 methods

## Total Counts
- **Modules scanned:** 43
- **Controller files:** 88
- **Service files:** 78
- **Entity files:** 84
- **Total DB tables:** 84
- **Zero-TODO services:** All services have 0 TODOs (no incomplete implementations flagged)
