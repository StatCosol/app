# Project source map

Generated from source by backend/scripts/research-project.cjs. This is declaration coverage, not certification of runtime behavior. Role aliases, global guards, service scopes and module entitlements still apply. Frontend route counts include parent/group/redirect declarations.

951 backend source files; 186 backend test files; 63 Nest modules; 241 controllers; 1475 HTTP handlers; 229 entity classes; 363 frontend route declarations; 39 scheduled methods; 145 explicit status/state assignments.

## Role declarations

| Role | GET handlers | Other HTTP handlers |
| --- | --- | --- |
| ACCOUNTS | 18 | 23 |
| ADMIN | 452 | 385 |
| AUDITOR | 87 | 38 |
| BRANCH | 18 | 6 |
| BRANCH_DESK | 44 | 10 |
| BRANCH_EXEC | 6 | 0 |
| BRANCH_MANAGER | 6 | 0 |
| BRANCH_USER | 1 | 1 |
| CCO | 162 | 90 |
| CEO | 163 | 58 |
| CLIENT | 317 | 159 |
| CONTRACTOR | 46 | 29 |
| CRM | 258 | 163 |
| EMPLOYEE | 27 | 18 |
| PAYDEK | 5 | 0 |
| PAYROLL | 75 | 83 |
| PF_TEAM | 3 | 3 |
| SALES | 5 | 4 |

## Domains

| Domain | Controllers | HTTP handlers | Entities |
| --- | --- | --- | --- |
| accounts-billing | 7 | 41 | 9 |
| admin | 8 | 59 | 1 |
| ai | 1 | 28 | 11 |
| applicability | 2 | 17 | 15 |
| assignments | 4 | 20 | 4 |
| attendance | 2 | 26 | 4 |
| auditor | 3 | 11 | 0 |
| audits | 9 | 90 | 7 |
| auth | 1 | 8 | 1 |
| automation | 7 | 26 | 2 |
| biometric | 3 | 17 | 2 |
| branch-compliance | 5 | 26 | 2 |
| branches | 11 | 64 | 6 |
| calendar | 1 | 1 | 0 |
| cco | 3 | 16 | 3 |
| ceo | 3 | 29 | 0 |
| checklists | 1 | 4 | 1 |
| cleanup | 1 | 11 | 0 |
| client-contacts | 1 | 11 | 2 |
| client-dashboard | 1 | 2 | 0 |
| clients | 6 | 28 | 2 |
| common | 1 | 5 | 1 |
| compliance | 14 | 52 | 7 |
| compliance-documents | 3 | 18 | 3 |
| compliances | 6 | 21 | 4 |
| contractor | 18 | 121 | 15 |
| crm | 4 | 52 | 0 |
| crm-documents | 3 | 8 | 1 |
| dashboard | 1 | 16 | 0 |
| employees | 5 | 38 | 11 |
| escalations | 1 | 2 | 1 |
| ess | 4 | 55 | 5 |
| facedesk | 7 | 62 | 13 |
| files | 1 | 1 | 0 |
| health | 1 | 2 | 0 |
| helpdesk | 7 | 18 | 3 |
| legitx | 4 | 17 | 0 |
| mobile-attendance | 6 | 38 | 11 |
| monthly-close | 1 | 3 | 0 |
| monthly-documents | 1 | 3 | 1 |
| news | 1 | 7 | 1 |
| nominations | 1 | 5 | 0 |
| notices | 3 | 12 | 3 |
| notifications | 3 | 20 | 3 |
| options | 7 | 12 | 0 |
| payroll | 25 | 183 | 40 |
| performance-appraisal | 4 | 26 | 11 |
| reports | 6 | 15 | 0 |
| returns | 6 | 42 | 2 |
| risk | 1 | 3 | 0 |
| safety-documents | 4 | 23 | 2 |
| sales | 2 | 12 | 2 |
| service-entitlements | 1 | 7 | 0 |
| sla | 1 | 2 | 1 |
| task-center | 1 | 4 | 0 |
| units | 1 | 5 | 3 |
| users | 6 | 30 | 5 |

## Reading the inventory

The JSON records source file/line for each HTTP handler, declared role/guard metadata, entity fields/relations, scheduled jobs and explicit status assignments. Missing decorator metadata is a review lead, not proof of missing authorization: global JWT/role/scope guards and device-specific guards also exist. Dynamic expressions are marked with angle brackets.
