# StatCo Solutions — Module-Wise Workflow Training Journal

**Platform:** StatCo Compliance Management System  
**Portal Names:** StatCo Admin | LegitX (Client) | BranchDesk | ConTrack (Contractor) | PayDek (Payroll) | Employee Desk (ESS)

---

## Table of Contents

1. [Admin Portal (StatCo Admin)](#1-admin-portal-statco-admin)
2. [CEO Portal](#2-ceo-portal)
3. [CCO Portal (Chief Compliance Officer)](#3-cco-portal)
4. [CRM Portal (Client Relationship Manager)](#4-crm-portal)
5. [Client Portal (LegitX)](#5-client-portal-legitx)
6. [Branch Portal (BranchDesk)](#6-branch-portal-branchdesk)
7. [Contractor Portal (ConTrack)](#7-contractor-portal-contrack)
8. [Auditor Portal](#8-auditor-portal)
9. [Payroll Portal (PayDek)](#9-payroll-portal-paydek)
10. [Employee Self-Service (Employee Desk)](#10-employee-self-service-employee-desk)
11. [PF & ESI Team Portal](#11-pf--esi-team-portal)
12. [Cross-Module Status Workflows](#12-cross-module-status-workflows)

---

## 1. Admin Portal (StatCo Admin)

**Role:** System Administrator  
**Access:** `/admin/...`  
**Purpose:** Full system governance — user management, client onboarding, compliance configuration, AI intelligence, and system monitoring.

### 1.1 Navigation Menu

| Group | Menu Item | Purpose |
|-------|-----------|---------|
| **Overview** | Dashboard | System-wide KPIs, escalation queue, risk alerts |
| | Reports | Cross-module analytical reports |
| **User & Client Mgmt** | Users | Create, edit, activate/deactivate system users |
| | Clients | Register companies, manage branches, set compliances |
| | Assignments | Assign CRM and Auditor to clients |
| | Payroll Assignments | Assign payroll managers to clients |
| | Governance Center | Oversight of unassigned clients |
| | Unassigned Clients | View and manage clients with no CRM/Auditor/Payroll assignment |
| **Configuration** | Masters | Compliance items, audit categories |
| | Payroll Templates | Configure salary structures |
| | Payroll Client Settings | Client-specific payroll configuration |
| | Approvals | Review pending approval requests |
| | Applicability Engine | Rule-based compliance applicability |
| | Engine Config | Applicability engine rule configuration |
| **Monitoring** | SLA Tracker | Track compliance SLA performance |
| | Escalations | View and manage escalated items |
| | Notifications | System notification inbox |
| | Digest | Configure and send digest emails |
| | Latest News | Publish news/announcements for all portals |
| | Helpdesk | Support ticket management |
| | Audit Logs | System activity audit trail |
| **AI Intelligence** | AI Hub | Central AI dashboard |
| | AI Risk Analysis | AI-powered risk scoring |
| | AI Audit Insights | AI-generated audit observations |
| | AI Payroll | Payroll anomaly detection |
| | AI Config | AI settings and thresholds |

### 1.2 Key Workflows

#### Workflow A: Onboard a New Client

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Clients** page | `/admin/clients` |
| 2 | Fill the **Client Registration** form: Company Name, Master User (Name, Email, Mobile, Password), upload logo | Company tab |
| 3 | System creates the client + master user account and displays auto-generated credentials | Company tab |
| 4 | Select the new client → switch to **Branches** tab | Branches tab |
| 5 | Click **Create Branch**: enter Name, Type (HO/Zonal/Branch/Factory/etc.), State, Address, Headcount, Branch User details | Branches tab |
| 6 | Switch to **Compliances** tab → toggle which compliance items apply to each branch | Compliances tab |
| 7 | Go to **Assignments** → assign a CRM and an Auditor to the client | `/admin/assignments` |
| 8 | Go to **Payroll Assignments** → assign a payroll manager | `/admin/payroll-assignments` |

#### Workflow B: Create a New User

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Users** page | `/admin/users` |
| 2 | Expand the **Create User** section | Top of page |
| 3 | Select Role (Admin/CEO/CCO/CRM/Auditor/Payroll/PF_TEAM/Contractor) | Dropdown |
| 4 | If Client role → select Company; if applicable → select CCO | Conditional fields |
| 5 | Fill Name, Email, Mobile; Password auto-generates if left blank | Form fields |
| 6 | Click **Create** → credentials displayed on screen | Success panel |
| 7 | Share credentials with the user securely | Manual step |

#### Workflow C: Manage Compliance Masters

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Masters** | `/admin/masters` |
| 2 | View/Add/Edit compliance items | Compliances tab |
| 3 | View/Add/Edit audit observation categories | Categories tab |
| 4 | Items become available for branch applicability configuration | Automatic |

#### Workflow D: Monitor System Health

| Step | Action | Page |
|------|--------|------|
| 1 | Open **Dashboard** | `/admin/dashboard` |
| 2 | Review KPI cards: Clients, Branches, SLA Health, Overdue, Due Soon, Unread notifications | Top section |
| 3 | Check **Risk Alerts**: Audit Overdue, No CRM, No Payroll, 0 Branches, No MCD Uploads | Alerts panel |
| 4 | Check **System Health**: Inactive Users (>15d), Unassigned Clients, Failed Notifications, Failed Jobs | Bottom section |
| 5 | Review **Escalation Queue** and take action (Notify/View) | Escalations table |

---

## 2. CEO Portal

**Role:** Chief Escalation Officer  
**Access:** `/ceo/...`  
**Purpose:** Executive oversight — approvals, escalations, compliance scoring, and organizational risk assessment.

### 2.1 Navigation Menu

| Group | Menu Item | Purpose |
|-------|-----------|---------|
| **Overview** | Dashboard | Executive KPIs, compliance trends, risk ranking |
| | Notifications | Thread-based notification inbox |
| **Governance** | Approvals | Review and approve/reject requests |
| | Escalations | View escalated compliance items |
| | Oversight | Deep analysis — CCO workload, team metrics, and performance drill-down |
| | Branches | Browse all branches and drill into branch details |
| **Intelligence** | Reports | Export & download — compliance, risk, and DTSS reports |
| | Registers | View statutory registers |
| **Account** | Profile | Personal profile and password management |

### 2.2 Key Workflows

#### Workflow A: Daily Executive Review

| Step | Action | Page |
|------|--------|------|
| 1 | Open **Dashboard** | `/ceo/dashboard` |
| 2 | Review 6 KPI cards: Total Clients, Pending Approvals, Active Audits, Overdue Compliances, Team Size, Compliance Score | Top section |
| 3 | Check **Executive Guardrails** panel for CRITICAL/HIGH/MEDIUM severity alerts | Alerts panel |
| 4 | Review **Overall Compliance Rate** and **Audit Completion (90d)** progress bars | Mid section |
| 5 | Review **Monthly Compliance Trend** table | Trend section |
| 6 | Review **Top 10 Risk Clients** and **Branch Ranking** tables | Bottom section |

#### Workflow B: Process Approvals

| Step | Action | Page |
|------|--------|------|
| 1 | Click **Pending Approvals** card on Dashboard (or go to Approvals) | `/ceo/approvals` |
| 2 | Review each pending request with details | Approvals list |
| 3 | Click **Approve** or **Reject** with optional comments | Action buttons |

#### Workflow C: Handle Escalations

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Escalations** | `/ceo/escalations` |
| 2 | Review escalated items with client, issue type, and delay details | Escalations table |
| 3 | Add comment or close escalation | Action buttons |

#### Workflow D: Generate Reports

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Reports** | `/ceo/reports` |
| 2 | Select report type: Summary, Compliance, Risk Heatmap, DTSS | Report selector |
| 3 | Preview and/or Export as PDF | Export button |

#### Workflow E: Browse Branches

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Branches** | `/ceo/branches` |
| 2 | View all branches across clients with compliance status | Branch list |
| 3 | Click a branch for detailed view | `/ceo/branches/:branchId` |
| 4 | Review branch compliance, employee count, and risk indicators | Branch detail |

---

## 3. CCO Portal

**Role:** Chief Compliance Officer  
**Access:** `/cco/...`  
**Purpose:** Compliance oversight, CRM team management, escalation handling, and risk monitoring.

### 3.1 Navigation Menu

| Group | Menu Item | Purpose |
|-------|-----------|---------|
| **Overview** | Dashboard | Compliance KPIs, CRM team stats, escalations |
| | Notifications | Thread-based notification inbox |
| **Compliance** | Approvals | Review and approve/reject compliance requests |
| | Oversight | Deep analysis — drill into delays, trends, and risk signals |
| | Escalations | Handle escalated compliance items |
| | Risk Heatmap | Visual risk scoring matrix |
| | Controls | Configure SLA rules, thresholds, reminders |
| | Registers | View statutory register data |
| **Team Management** | CRMs Under Me | View assigned CRM team members |
| | CRM Performance | CRM-wise performance metrics |
| **Account** | Profile | Personal profile and password management |

### 3.2 Key Workflows

#### Workflow A: Daily Oversight Review

| Step | Action | Page |
|------|--------|------|
| 1 | Open **Dashboard** | `/cco/dashboard` |
| 2 | Review 4 KPI cards: Pending Approvals, Total CRMs, Overdue Tasks, Escalations | Top section |
| 3 | Review **CRM Team Performance** table: Name, Client Count, Overdue Count, Last Login | Team table |
| 4 | Check **Top Overdue Clients/Branches** and **CRMs with Most Overdue** | Two-column section |
| 5 | Review **Escalated Compliance Tasks** table | Escalations table |

#### Workflow B: Configure Compliance Controls

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Controls** | `/cco/controls` |
| 2 | Set **SLA Rules**: define compliance SLA timelines | SLA section |
| 3 | Set **Escalation Thresholds**: define when items auto-escalate | Thresholds section |
| 4 | Set **Reminder Rules**: configure automated reminder emails | Reminders section |

#### Workflow C: Process Approvals

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Approvals** | `/cco/approvals` |
| 2 | Review pending items | Approval queue |
| 3 | Click **Approve** or **Reject** | Action buttons |

---

## 4. CRM Portal

**Role:** Client Relationship Manager  
**Access:** `/crm/...`  
**Purpose:** Manage assigned client portfolio — compliance tracking, document review, audit coordination, helpdesk, contractor management.

### 4.1 Navigation Menu

| Group | Menu Item | Purpose |
|-------|-----------|---------|
| **Overview** | Dashboard | Action workbench with prioritized tasks |
| **Client Management** | All Clients | Client portfolio with per-client workspace |
| | Helpdesk | Support ticket management |
| **Compliance** | Compliance Tracker | Track compliance across all clients/branches |
| | Returns / Filings | Manage statutory return filings |
| | Document Review Center | Review branch-uploaded documents & reupload requests (merged) |
| | Compliance Calendar | Calendar view of upcoming due dates |
| | SLA Tracker | SLA performance monitoring |
| | Escalations | Handle escalated items |
| | Renewals Workspace | Manage upcoming licence/registration renewals |
| | Amendments Workspace | Manage compliance amendment requests |
| **Audits & Reports** | Audits | Create and manage audits |
| | Reports | Generate compliance and performance reports |
| **Account** | Profile | Personal profile and password management |

### 4.2 Key Workflows

#### Workflow A: Daily Action Review

| Step | Action | Page |
|------|--------|------|
| 1 | Open **Dashboard** (Action Workbench) | `/crm/dashboard` |
| 2 | Check 6 KPI cards: Assigned Clients, Compliance %, Pending Reviews, Overdue, Expiring 30d, Reupload Required | Top section |
| 3 | Use **Action Shortcuts**: Open Review Queue, Returns Workspace, Renewals Workspace, etc. | Shortcut buttons |
| 4 | Review **Due Compliances** by tab: Overdue / Due Soon / This Month | Due table |
| 5 | Review **Top Risk Clients** and **Upcoming Audits** | Bottom section |

#### Workflow B: Client Workspace Deep-Dive

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **All Clients** | `/crm/clients` |
| 2 | Click a client to open their workspace | `/crm/clients/:clientId` |
| 3 | Use sub-navigation tabs: Branches, Compliance Tracker, Contractors, Documents, Safety, Payroll Status | Client workspace |
| 4 | Within **Branches**: view branch details, manage compliance, manage contractors | Branch management |
| 5 | Within **Compliance Tracker**: review MCD items, finalize monthly compliance | Compliance tracking |

#### Workflow C: Review Branch Compliance Documents

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Document Review Center** | `/crm/branch-docs-review` |
| 2 | Filter by client, branch, status | Filters |
| 3 | Review each submitted document | Document table |
| 4 | Mark as **Approved** or **Return for Reupload** with remarks | Action buttons |

#### Workflow D: Create and Manage Audits

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Audits** | `/crm/audits` |
| 2 | Click **Create Audit**: select Client, Branch, Audit Type, Period, Due Date | Create form |
| 3 | **Assign Auditor** to the audit | Assign button |
| 4 | Monitor audit status: PLANNED → IN_PROGRESS → COMPLETED | Status column |
| 5 | Check **Readiness** and **Report Status** for each audit | Detail view |

#### Workflow E: Register a Contractor

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **All Clients** → select a client → **Contractors** tab | Client workspace |
| 2 | Or use top-level CRM contractor registration | `/crm/contractors` |
| 3 | Fill registration form: Name, Email, Mobile, Company | Registration form |
| 4 | System creates contractor user account | Automatic |
| 5 | Link contractor to specific branches | Branch mapping |

#### Workflow F: Handle Returns / Filings

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Returns / Filings** | `/crm/returns` |
| 2 | View all filings by status | Filings table |
| 3 | Update filing status (Pending → Filed → Acknowledged) | Status actions |
| 4 | Upload acknowledgment or challan documents | Upload buttons |

---

## 5. Client Portal (LegitX)

**Role:** Client (Master User or Branch User)  
**Access:** `/client/...`  
**Purpose:** Compliance monitoring, employee management, branch oversight, payroll input, document management.

> **Note:** Master Users see the full menu. Branch Users may have Payroll access based on settings.

### 5.1 Navigation Menu

| Group | Menu Item | Visibility | Purpose |
|-------|-----------|------------|---------|
| **Overview** | Dashboard | All | Company-wide compliance and operational KPIs |
| **Compliance** | Compliance Status | All | Company-wide compliance summary — aggregated KPIs, charts, trends |
| | Branch Compliance | All | Branch-level execution view — item-by-item compliance tracking |
| | Compliance Upload Center | All | Monthly uploads, MCD tracking & reupload requests (tabbed) |
| | Returns / Filings | All | Statutory return filing status |
| | Registrations & Licenses | All | Registration and license tracking |
| | Document Repository | All | Searchable document archive |
| | Unit Documents | All | Branch unit document uploads & tracking |
| | Safety | All | Safety document management |
| | Compliance Calendar | All | Calendar of upcoming due dates |
| | Risk Heatmap | All | Visual risk scoring |
| | SLA Tracker | All | SLA performance |
| | Risk Trend | All | Risk trend analysis |
| | Escalations | All | Escalated items |
| | Audits | All | View audit results |
| **Payroll** | Payroll | Conditional | Payroll input monitoring |
| | Employees | All | Employee master data |
| | Registers | All | Download registers |
| | Attendance | Conditional | Attendance review |
| | Master Data | All | Departments, designations, grades |
| **Company** | Branches | All | Organization structure — view and manage registered branches |
| | Contractors | All | View contractor details |
| **Approvals** | Approvals Center | All | Unified approval dashboard (nominations, leaves, all types) |
| **Support** | My Queries | All | Raise and track support queries |
| **Account** | Profile | All | Personal profile management |
| | Access Settings | All | Configure portal access |

### 5.2 Key Workflows

#### Workflow A: Dashboard Review

| Step | Action | Page |
|------|--------|------|
| 1 | Open **Dashboard** | `/client/dashboard` |
| 2 | Use filters: Month, Year, Branch, Contractor | Top filters |
| 3 | Review KPI Row 1: Employees (Active on-role, M/F), Contract Employees, Payroll Pending, Branches Live | KPI cards |
| 4 | Review KPI Row 2: Compliance %, Audit Score, Critical Items, Pending Items | KPI cards |
| 5 | Review charts: Compliance Trend, Branch Rank, Audit Donut, Payroll Status | Chart section |
| 6 | Check **Vendor Compliance Scores**: Top Performers + Bottom Performers | Vendor table |

#### Workflow B: Add a New Employee

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Employees** | `/client/employees` |
| 2 | Click **Add Employee** | New button |
| 3 | Fill employee form: Name as per Aadhaar, DOB as per Aadhaar, Gender, Department, Designation, Grade | `/client/employees/new` |
| 4 | Fill statutory details: Aadhaar (12 digits), PAN (5 letters + 4 digits + 1 letter), UAN, ESIC | Form fields |
| 5 | Fill contact: Mobile (country code + 10 digits), Email (must include @) | Form fields |
| 6 | Fill bank details: Bank Name, Account Number, IFSC | Form fields |
| 7 | Click **Save** — validation runs for all fields | Save button |

#### Workflow C: Monitor Compliance Status

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Compliance Status** | `/client/compliance/status` |
| 2 | View overall compliance percentage across all branches | Dashboard |
| 3 | Drill into specific branch for detailed compliance items | Branch detail |
| 4 | Check **SLA Tracker** for items approaching deadlines | `/client/sla` |
| 5 | Check **Escalations** for auto-escalated overdue items | `/client/escalations` |

#### Workflow D: Manage Branches

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Branches** | `/client/branches` |
| 2 | View all branches with on-role employee and contract employee counts | Branch list |
| 3 | Click a branch for detailed workspace | `/client/branches/:branchId` |
| 4 | Within branch workspace: view dashboard, compliance items, registrations, documents, audit observations | Branch detail |

#### Workflow E: Process Approvals

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Approvals Center** | `/client/approvals` |
| 2 | Review all pending approvals in unified view | Approvals list |
| 3 | For nomination approvals → **Nomination Approvals** tab | `/client/approvals/nominations` |
| 4 | For leave approvals → **Leave Approvals** tab | `/client/approvals/leaves` |
| 5 | Approve or reject with comments | Action buttons |

#### Workflow F: Raise a Support Query

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **My Queries** | `/client/queries` |
| 2 | Click **New Query** | Create button |
| 3 | Enter subject and description | Query form |
| 4 | Track query status and responses | Query thread |

---

## 6. Branch Portal (BranchDesk)

**Role:** Branch User  
**Access:** `/branch/...`  
**Purpose:** Branch-level compliance execution — upload documents, manage employees, track contractors, handle reupload requests.

### 6.1 Navigation Menu

| Menu Item | Purpose |
|-----------|---------|
| Dashboard | Branch KPIs, compliance %, vendor scores |
| Employees | Branch employee management |
| Contractors | Branch contractor management |
| **Compliance** (group) | |
| -- Branch Compliance | Compliance item tracking |
| -- Monthly Compliance | Monthly compliance task workspace, uploads & reupload requests (tabbed) |
| -- Periodic Uploads | Quarterly/half-yearly/yearly uploads |
| -- Registrations | Registration and license tracking |
| -- Compliance Calendar | Due date calendar |
| -- Risk Heatmap | Branch risk scoring |
| -- SLA Tracker | SLA performance |
| -- Risk Trend | Risk trend analysis |
| -- Escalations | Escalated items |
| -- Audit Observations | View audit findings |
| Document Repository | Branch document archive |
| Unit Documents | Branch unit document uploads & tracking |
| Safety | Safety document management |
| Reports | Branch reports |
| Notifications | System notification inbox |
| Helpdesk | Raise and track support queries |

### 6.2 Key Workflows

#### Workflow A: Daily Compliance Check

| Step | Action | Page |
|------|--------|------|
| 1 | Open **Dashboard** | `/branch/dashboard` |
| 2 | Review KPIs: On-role Employee HC, Contract Employee HC, PF Pending, ESIC Pending | KPI cards |
| 3 | Check Compliance %, Document Upload %, Open Observations | Status cards |
| 4 | Check **Vendor Compliance Scores** for contractor performance | Vendor tables |

#### Workflow B: Upload Monthly Compliance Documents

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Monthly Compliance** (in Compliance group) | `/branch/compliance/monthly` |
| 2 | Review 4 KPI cards: Upload %, Pending, Returned, Reviewed | Summary cards |
| 3 | Select Category, Sub-category, Return Code from dropdowns | Upload form |
| 4 | Pick file and add optional notes | File picker |
| 5 | Click **Upload** | Upload button |
| 6 | Track upload status in the checklist table: progress per item | Checklist |

#### Workflow C: Handle Periodic Uploads (Quarterly/Half-Yearly/Yearly)

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Periodic Uploads** | `/branch/uploads` |
| 2 | Select frequency tab: Quarterly / Half-yearly / Yearly | Tab selector |
| 3 | Select period (Quarter/Half) and Year | Period selector |
| 4 | Filter by Status, Law Area, Category | Filters |
| 5 | Review 7 summary cards: Total, Uploaded, Pending, In Review, Returned, Overdue, Completeness % | Summary cards |
| 6 | Upload documents for pending items | Upload action |
| 7 | If returned by CRM → review remarks and resubmit | Resubmit flow |

**Status Flow:** NOT_UPLOADED → SUBMITTED → (REUPLOAD_REQUIRED → RESUBMITTED) → APPROVED, or OVERDUE

#### Workflow D: Handle Reupload Requests

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Monthly Compliance** → click **Returned for Reupload** tab | `/branch/compliance/monthly` |
| 2 | Review returned documents with CRM remarks | Reupload list |
| 3 | Upload corrected document | Upload action |
| 4 | Submit for re-review | Submit button |

#### Workflow E: Manage Employees

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Employees** | `/branch/employees` |
| 2 | View employee list with search and filters | Employee table |
| 3 | Click **Add Employee** for new hire | New form |
| 4 | Fill form with validations: Name as per Aadhaar, DOB, Aadhaar (12 digits), PAN (5+4+1 format), Mobile (country code + 10 digits), Email | Employee form |
| 5 | View/Edit employee details and documents | Detail page |

---

## 7. Contractor Portal (ConTrack)

**Role:** Contractor  
**Access:** `/contractor/...`  
**Purpose:** Complete assigned compliance tasks, upload evidence, respond to reupload requests, maintain profile.

### 7.1 Navigation Menu

| Group | Menu Item | Purpose |
|-------|-----------|---------|
| **Overview** | Dashboard | Task overview, alerts, branch status |
| **Work** | Tasks | Unified Task Center (tasks + reuploads + compliance) |
| | Notifications | System notification inbox |
| **Support** | Support | Raise and track support queries |
| **Account** | Profile | Company profile and identity management |

### 7.2 Key Workflows

#### Workflow A: Daily Task Review

| Step | Action | Page |
|------|--------|------|
| 1 | Open **Dashboard** | `/contractor/dashboard` |
| 2 | Review 5 KPI cards: Required Docs, Due Today, Overdue, In Progress, Awaiting Approval | KPI row |
| 3 | Check **Operational Guardrails** for CRITICAL/HIGH/MEDIUM alerts | Alerts panel |
| 4 | Review 5 upgrade widgets: Expiring Licenses, Pending Uploads, Rejected Docs, Onboarding, Mapping | Widget row |
| 5 | Review **Branch-wise Status Board**: Branch, Total, Pending, Rejected, Overdue, Approved | Status table |

#### Workflow B: Complete a Compliance Task

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Tasks** (Unified Task Center) | `/contractor/tasks` |
| 2 | Review summary cards: Total, Open, Due Today, Overdue, Submitted, Approved | Summary row |
| 3 | Use filters: Type (Tasks/Reuploads), Status, Due date, Branch | Filter bar |
| 4 | Click a task in the left panel to view details on the right | Master-detail layout |
| 5 | Click **Start Task** to move from PENDING to IN_PROGRESS | Start button |
| 6 | **Upload Evidence**: pick file, add note, click Upload | Upload form |
| 7 | Add any comments via the **Reply** section | Comment form |
| 8 | Click **Submit Task** when all evidence is uploaded | Submit button |
| 9 | Wait for CRM review → status moves to APPROVED or REJECTED | Automatic |
| 10 | If REJECTED → review rejection reason, upload corrected evidence, resubmit | Resubmit flow |

**Status Flow:** PENDING → IN_PROGRESS → SUBMITTED → APPROVED / REJECTED → (if rejected) REUPLOAD → REVERIFIED → CLOSED

#### Workflow C: Update Profile

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Profile** | `/contractor/profile` |
| 2 | View/Edit company details, identity documents | Profile form |
| 3 | Validate mobile (country code + 10 digits), email (@ required) | Field validation |
| 4 | Click **Save** | Save button |

---

## 8. Auditor Portal

**Role:** Auditor  
**Access:** `/auditor/...`  
**Purpose:** Execute compliance audits — review evidence, log observations, score severity, build audit reports.

### 8.1 Navigation Menu

| Group | Menu Item | Purpose |
|-------|-----------|---------|
| **Overview** | Dashboard | Audit KPIs, assigned audits overview |
| **Audit Work** | Audits | List of all assigned audits |
| | Observations | Cross-audit observation verification |
| | Compliance | Compliance status view for audited clients |
| | Compliance Tasks | Audit-related compliance task management |
| | Reupload Inbox | Review and process reupload requests from audits |
| | Registers | Statutory register access |
| | Reports | Final report builder — compose, review, and export audit reports |

### 8.2 Key Workflows

#### Workflow A: Daily Audit Review

| Step | Action | Page |
|------|--------|------|
| 1 | Open **Dashboard** | `/auditor/dashboard` |
| 2 | Use filters: Client, Audit Type, Date range | Top filters |
| 3 | Review 6 KPI cards: Assigned, Overdue, Due Soon, Observations Open, High-Risk Open, Reports Pending | KPI cards |
| 4 | Review **My Audits** table by tab: Active / Overdue / Due Soon / Completed | Tabbed table |
| 5 | Click **Open Cockpit** to begin working on an audit | Action button |

#### Workflow B: Execute an Audit (Audit Cockpit)

| Step | Action | Page |
|------|--------|------|
| 1 | Open an audit from the Audits list or Dashboard | `/auditor/audits/:auditId/workspace` |
| 2 | Review **Audit Scope Header**: Client, Branch, Type, Period, Due Date | Scope section |
| 3 | Follow the **Audit Checklist** (6 items): | Checklist panel |
| | ☐ Audit scope loaded | |
| | ☐ Evidence tray populated | |
| | ☐ Observation draft logged | |
| | ☐ Severity score calculated | |
| | ☐ Report draft finalized | |
| | ☐ Audit marked completed | |
| 4 | Review **Evidence Tray**: search documents, view compliance status | Evidence panel |
| 5 | If document needs correction → click **Request Reupload** with remarks | Reupload modal |
| 6 | Use **Observation Builder**: select Category, write Observation, Consequences, Recommendation, set Risk Level | Observation form |
| 7 | Click **Calculate Severity Score** | Score button |
| 8 | Follow **Report Progress Stepper**: Planned → Fieldwork → Report Draft → Finalized | Stepper |
| 9 | Use status transition buttons to advance audit state | Status buttons |

**Audit Status Flow:** PLANNED → IN_PROGRESS → COMPLETED  
**Report Flow:** No Report → DRAFT → FINAL

#### Workflow C: Log and Verify Observations

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Observations** | `/auditor/observations` |
| 2 | View all observations across audits | Observation list |
| 3 | Filter by client, audit, risk level | Filters |
| 4 | Click an observation to view details | Detail view |
| 5 | **Verify** resolved observations or **Reopen** if not adequately addressed | Action buttons |

#### Workflow D: Build Audit Reports

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Reports** | `/auditor/reports` |
| 2 | Select an audit | Report list |
| 3 | Use the **Report Builder** to compose the report | `/auditor/reports/:auditId/builder` |
| 4 | Finalize and export | Export button |

---

## 9. Payroll Portal (PayDek)

**Role:** Payroll Manager  
**Access:** `/payroll/...`  
**Purpose:** End-to-end payroll processing — employee data management, payroll runs, PF/ESI compliance, TDS calculations, report generation.

> **Architecture:** PayDek uses **client-scoped workspaces** (like the CRM portal). The payroll manager first selects a client from the Clients list, which opens a dedicated client workspace at `/payroll/clients/:clientId/...`. All payroll operations — employees, runs, PF/ESI, registers, F&F, queries, setup, rule sets, and structures — are scoped to that client. A **Client Context Strip** at the top of every client-scoped page shows the active client identity. Global pages (Dashboard, TDS Calculator, Gratuity Calculator, Reports, Profile) remain accessible outside the client context.

### 9.1 Navigation Menu

**Global Pages (no client context required):**

| Group | Menu Item | Purpose |
|-------|-----------|---------|
| **Overview** | Dashboard | Payroll KPIs, quick actions, recent runs |
| **People** | Clients | Assigned client portfolio — click to enter client workspace |
| **Tools** | TDS Calculator | Income tax computation |
| | Gratuity Calculator | Gratuity amount calculation |
| **Analytics** | Reports | Payroll analytics and reports |
| **Account** | Profile | Personal profile management |

**Client Workspace (inside `/payroll/clients/:clientId/...`):**

| Group | Menu Item | Route | Purpose |
|-------|-----------|-------|---------|
| **Navigation** | ← All Clients | `/payroll/clients` | Return to client list |
| | Dashboard | `/payroll/dashboard` | Global payroll dashboard |
| **Client Workspace** | Overview | `/payroll/clients/:clientId` | Client workspace landing — tab-grid to all sub-pages |
| | Employees | `/payroll/clients/:clientId/employees` | Employee master data for this client |
| **Payroll Operations** | Payroll Runs | `/payroll/clients/:clientId/runs` | Step-based payroll execution console |
| | PF / ESI Compliance | `/payroll/clients/:clientId/pf-esi` | PF and ESI statutory compliance |
| | Registers | `/payroll/clients/:clientId/registers` | Statutory register generation |
| | Full & Final | `/payroll/clients/:clientId/full-and-final` | F&F settlement processing |
| **Communication** | Queries | `/payroll/clients/:clientId/queries` | Handle this client's payroll queries |
| **Configuration** | Payroll Setup | `/payroll/clients/:clientId/setup` | Client-specific payroll configuration |
| | Rule Sets | `/payroll/clients/:clientId/rule-sets` | Calculation rules and formulas |
| | Salary Structures | `/payroll/clients/:clientId/structures` | Define salary component structures |
| **Tools & Account** | TDS Calculator | `/payroll/tds-calculator` | Income tax computation |
| | Gratuity Calculator | `/payroll/gratuity-calculator` | Gratuity amount calculation |
| | Reports | `/payroll/reports` | Payroll analytics and reports |
| | Profile | `/payroll/profile` | Personal profile management |

### 9.2 Key Workflows

#### Workflow A: Enter a Client Workspace

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Clients** | `/payroll/clients` |
| 2 | View the list of assigned clients with status | Clients list |
| 3 | Click a client row to enter their workspace | `/payroll/clients/:clientId` |
| 4 | Review **Client Context Strip** showing active client name and code | Top of page |
| 5 | Use **Tab Grid** to navigate: Employees, Runs, PF/ESI, Registers, F&F, Queries, Setup, Rule Sets, Structures | Overview grid |
| 6 | Sidebar auto-switches to client-scoped navigation with all sub-pages | Left sidebar |
| 7 | Click **← All Clients** in sidebar to return to client list | Sidebar link |

> **Access Guard:** Navigating to `/payroll/clients/:clientId/...` for an unassigned client redirects back to `/payroll/clients?denied=client`.

#### Workflow B: Process Monthly Payroll

| Step | Action | Page |
|------|--------|------|
| 1 | Enter **Client Workspace** → click **Runs** | `/payroll/clients/:clientId/runs` |
| 2 | Use filters: Month, Year | Top filters |
| 3 | Review 5 summary cards: Runs, Draft, Processed, Submitted, Approved | Summary row |
| 4 | Click a payroll run to open the **Run Workspace** | Run detail |
| 5 | Follow the **Process Stepper**: | Stepper |
| | Step 1: **Input Freeze** — lock inputs | |
| | Step 2: **Attendance Import** — upload attendance file | |
| | Step 3: **Arrears** — process any arrears | |
| | Step 4: **Preview** — review totals (Gross, Deductions, Net) | |
| | Step 5: **Approval** — submit for approval | |
| 6 | Review **Validation Exceptions** and resolve issues | Exception board |
| 7 | Check **Step Guardrails** (Allowed/Blocked per action) | Guardrails panel |
| 8 | Click **Process** → **Submit** → wait for **Approval** → **Publish** | Action buttons |

**Status Flow:** DRAFT → PROCESSED → SUBMITTED → APPROVED → PUBLISHED (or REJECTED)

#### Workflow C: Full & Final Settlement

| Step | Action | Page |
|------|--------|------|
| 1 | Enter **Client Workspace** → click **Full & Final** | `/payroll/clients/:clientId/full-and-final` |
| 2 | Select employee and exit date | F&F form |
| 3 | System calculates final settlement | Automatic |
| 4 | Review and approve F&F | Approval flow |

#### Workflow D: Configure Payroll for a Client

| Step | Action | Page |
|------|--------|------|
| 1 | Enter **Client Workspace** → click **Setup** | `/payroll/clients/:clientId/setup` |
| 2 | Configure statutory settings, pay cycle, leave/pay policy, attendance, deductions | Setup tabs |
| 3 | Navigate to **Rule Sets** → define calculation rules | `/payroll/clients/:clientId/rule-sets` |
| 4 | Navigate to **Salary Structures** → define component structures | `/payroll/clients/:clientId/structures` |

#### Workflow E: Handle Client Queries

| Step | Action | Page |
|------|--------|------|
| 1 | Enter **Client Workspace** → click **Queries** | `/payroll/clients/:clientId/queries` |
| 2 | View incoming queries from the client | Query list |
| 3 | Respond with answers/attachments | Reply form |

#### Workflow F: Manage Client Employees

| Step | Action | Page |
|------|--------|------|
| 1 | Enter **Client Workspace** → click **Employees** | `/payroll/clients/:clientId/employees` |
| 2 | Browse employees with search filters | Employee table |
| 3 | Click an employee row for detail view | `/payroll/clients/:clientId/employees/:employeeId` |
| 4 | Review payslip history, PF/ESI details, salary breakdown | Detail tabs |
| 5 | Click back button → returns to client-scoped employee list | Navigation |

#### Workflow G: PF / ESI Compliance

| Step | Action | Page |
|------|--------|------|
| 1 | Enter **Client Workspace** → click **PF / ESI** | `/payroll/clients/:clientId/pf-esi` |
| 2 | Review summary: applicability gaps, remittance readiness, challan evidence | Dashboard |
| 3 | Filter by scheme (PF/ESI), year, month | Filters |
| 4 | Review exception rows and download reports | Exception board |

---

## 10. Employee Self-Service (Employee Desk)

**Role:** Employee  
**Access:** `/ess/...`  
**Login:** Dedicated ESS login at `/ess/login` or branded `/ess/:companyCode/login`  
**Purpose:** View personal PF/ESI details, download payslips, apply for leave, manage nominations, update profile.

### 10.1 Navigation Menu

| Menu Item | Purpose |
|-----------|---------|
| Dashboard | Personal snapshot — net pay, PF, ESI, leave balance |
| My Profile | Personal and employment details |
| My PF | PF account details and contribution history |
| My ESI | ESI details and contribution history |
| Nominations | PF and insurance nominee management |
| Leave | Apply for leave and view balance |
| Attendance | View attendance records |
| Documents | Personal document uploads |
| Payslips | Download monthly payslips |
| Helpdesk | Raise support queries to HR/Payroll |

### 10.2 Key Workflows

#### Workflow A: Daily Quick Check

| Step | Action | Page |
|------|--------|------|
| 1 | Open **Dashboard** | `/ess/dashboard` |
| 2 | See 4 clickable KPI cards: latest NET PAY, PF/UAN, ESI/IP, LEAVE balance | KPI cards |
| 3 | Use **Quick Actions**: Download Payslip, Apply Leave, Nominations, My Profile | Action buttons |
| 4 | Review **Recent Activity** timeline | Activity section |
| 5 | Check **Leave Balances** table: Type, Opening, Accrued, Used, Available | Leave table |

#### Workflow B: Apply for Leave

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Leave** | `/ess/leave` |
| 2 | Click **Apply Leave** | Apply button |
| 3 | Select leave type, from/to dates, reason | Leave form |
| 4 | Submit application | Submit button |
| 5 | Track approval status | Leave list |

#### Workflow C: View/Download Payslip

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Payslips** | `/ess/payslips` |
| 2 | Select month/year | Date selector |
| 3 | View payslip details on screen | Payslip display |
| 4 | Click **Download** for PDF copy | Download button |

#### Workflow D: Update Profile

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **My Profile** | `/ess/profile` |
| 2 | Click **Edit Profile** | Edit button |
| 3 | Update editable fields: Phone (country code + 10 digits), Email, Bank Details | Form fields |
| 4 | Click **Save Changes** | Save button |

#### Workflow E: Manage PF Nominations

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **Nominations** | `/ess/nominations` |
| 2 | Add/Edit nominees with name, relationship, percentage | Nomination form |
| 3 | Submit for employer approval | Submit button |

#### Workflow F: Change Password

| Step | Action | Page |
|------|--------|------|
| 1 | Go to **My Profile** | `/ess/profile` |
| 2 | Click **Change Password** | Password section |
| 3 | Enter current password, new password (min 8 chars, upper + lower + digit + special), confirm password | Password form |
| 4 | Click **Save** | Save button |

---

## 11. PF & ESI Team Portal

**Role:** PF & ESI Team Member  
**Access:** `/pf-team/...`  
**Purpose:** Handle PF and ESI helpdesk tickets raised by employees and payroll managers.

### 11.1 Navigation Menu

| Menu Item | Purpose |
|-----------|---------|
| Dashboard | Ticket overview and KPIs |
| Tickets | Manage PF & ESI support tickets |

### 11.2 Key Workflows

#### Workflow A: Process PF/ESI Tickets

| Step | Action | Page |
|------|--------|------|
| 1 | Open **Dashboard** | `/pf-team/dashboard` |
| 2 | Review ticket KPIs | Dashboard cards |
| 3 | Go to **Tickets** | `/pf-team/tickets` |
| 4 | View incoming tickets | Ticket list |
| 5 | Open a ticket, review details and history | Ticket detail |
| 6 | Respond with resolution | Reply form |
| 7 | Close resolved tickets | Close button |

---

## 12. Cross-Module Status Workflows

### 12.1 Compliance Document Lifecycle

```
NOT_UPLOADED → SUBMITTED → APPROVED
                    ↓
            REUPLOAD_REQUIRED → RESUBMITTED → APPROVED
```

**Participants:**
- Branch User uploads → CRM reviews → Approved or Returned for Reupload → Branch resubmits

### 12.2 Contractor Task Lifecycle

```
PENDING → IN_PROGRESS → SUBMITTED → APPROVED
                              ↓
                          REJECTED → REUPLOAD → REVERIFIED → CLOSED
```

**Participants:**
- CRM creates task → Contractor starts, uploads evidence, submits → CRM approves or rejects

### 12.3 Audit Lifecycle

```
PLANNED → IN_PROGRESS → COMPLETED
```

**Report:** No Report → DRAFT → FINAL

**Participants:**
- CRM creates audit, assigns auditor → Auditor executes in cockpit → Auditor builds report

### 12.4 Payroll Run Lifecycle

```
DRAFT → PROCESSED → SUBMITTED → APPROVED → PUBLISHED
                         ↓              ↓
                      REJECTED       REJECTED
```

**Participants:**
- Payroll Manager creates run, processes, submits → Approver reviews → Published to employees

### 12.5 Escalation Flow

```
Compliance item overdue → Auto-escalation triggered → Notification sent → CCO/CEO reviews → Resolved
```

**Participants:**
- System auto-detects → Notifies CRM, CCO, CEO chain → Manual resolution

### 12.6 User Lifecycle

```
Created (Active) ↔ Deactivated (Inactive)
```

**Participants:**
- Admin creates → Admin can deactivate/reactivate

---

## Field Validation Quick Reference

| Field | Rule | Example |
|-------|------|---------|
| Mobile | Country code + 10 digits | +91 9876543210 |
| Aadhaar | Exactly 12 digits | 123456789012 |
| PAN | 5 uppercase letters + 4 digits + 1 uppercase letter | ABCDE1234F |
| Email | Must contain @ | user@company.com |
| Password | Min 8 chars, uppercase + lowercase + digit + special char | Admin@123 |

---

## Terminology: Employees vs Contractors

| Term | Meaning | Example |
|------|---------|--------|
| **Employees** | On-role (direct) employees of the company | 30 employees on company payroll |
| **Contractors** | Contract employees — individual workers deployed by contractor companies | 4 contract workers at a branch |
| **Contractor Company** | The vendor/agency registered in ConTrack that supplies contract employees | ABC Manpower Services Pvt. Ltd. |

> **Branch Table Context:** In the branch listing (Client/Admin portals), the **Employees** column shows on-role headcount and the **Contractors** column shows contract employee headcount at that branch — not the number of contractor companies.

---

## Portal Login Summary

| Portal | URL Path | Role |
|--------|----------|------|
| StatCo Admin | `/admin` | ADMIN |
| CEO | `/ceo` | CEO |
| CCO | `/cco` | CCO |
| CRM | `/crm` | CRM |
| Client (LegitX) | `/client` | CLIENT |
| Branch (BranchDesk) | `/branch` | CLIENT (Branch User) |
| Contractor (ConTrack) | `/contractor` | CONTRACTOR |
| Auditor | `/auditor` | AUDITOR |
| PayDek | `/payroll` | PAYROLL |
| Employee Desk | `/ess/login` | EMPLOYEE |
| PF & ESI Helpdesk | `/pf-team` | PF_TEAM |
