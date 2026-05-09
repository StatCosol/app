# Step-by-Step Training Sheets

> StatComPy Application — Module-wise Training Guide  
> Portal URL: https://app.statcosol.com

---

## Table of Contents

1. [Payroll (PayDek)](#1-payroll-paydek)
2. [CRM Portal](#2-crm-portal)
3. [Audit Console](#3-audit-console)
4. [Client Desk (LegitX)](#4-client-desk-legitx)
5. [Branch Desk](#5-branch-desk)

---

## 1. Payroll (PayDek)

**Role**: PAYROLL  
**Login URL**: https://app.statcosol.com/login → Select "Payroll"  
**Landing Page**: `/payroll/dashboard`

### Step 1: Login & Dashboard

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 1.1 | Enter email and password | Login page | Credentials validated |
| 1.2 | Click **Login** | Login page | Redirected to Payroll Dashboard |
| 1.3 | Review dashboard metrics | `/payroll/dashboard` | See pending runs, active clients, compliance summary |

### Step 2: Select a Client

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 2.1 | Click **Clients** in sidebar | Sidebar | Client list loads |
| 2.2 | Search or select a client | `/payroll/clients` | Client row highlighted |
| 2.3 | Click client name | Client list | Client Overview opens (`/payroll/clients/:id/overview`) |

### Step 3: Payroll Setup (First-time per Client)

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 3.1 | Click **Setup** in client menu | Client context | Setup page opens (`/payroll/clients/:id/setup`) |
| 3.2 | **Statutory Config** tab → Enable PF, ESI, PT as needed | Statutory tab | Toggle switches, set rates (PF 12%/12%, ESI 0.75%/3.25%) |
| 3.3 | Set **PF Wage Ceiling** (default ₹15,000) and **ESI Wage Ceiling** (₹21,000) | Statutory tab | Ceilings saved |
| 3.4 | Click **Save Statutory** | Statutory tab | ✅ "Statutory config saved" |
| 3.5 | **Pay Cycle** tab → Set cycle (Monthly), effective date, payout day | Pay Cycle tab | Cycle configured |
| 3.6 | Click **Save Pay Cycle** | Pay Cycle tab | ✅ "Pay cycle saved" |
| 3.7 | **Leave / Pay Policy** tab → Set accrual per month, carry forward | Leave tab | Policy configured |
| 3.8 | Click **Save Leave Policy** | Leave tab | ✅ "Leave policy saved" |
| 3.9 | **Attendance Config** tab → Set source, cutoff day, grace minutes | Attendance tab | Attendance configured |
| 3.10 | Click **Save Attendance** | Attendance tab | ✅ "Attendance config saved" |

### Step 4: Salary Structures

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 4.1 | Click **Structures** in client menu | Client context | Salary Structures Builder opens |
| 4.2 | Click **+ New Structure** | Structures page | Modal opens |
| 4.3 | Enter name, select scope (Client/Branch/Dept/Grade), set effective date | Modal | Structure defined |
| 4.4 | Click **Save** | Modal | Structure created |
| 4.5 | Select the structure → Click **+ Add Item** | Structure detail | Item modal opens |
| 4.6 | Select component (BASIC, HRA, etc.), set calc method (Fixed/Percentage/Formula) | Item modal | Component configured |
| 4.7 | Repeat for all earning components | Item modal | All components added |
| 4.8 | Use **Preview Calculation** section → Enter gross, date → Click **Run Preview** | Bottom of page | Preview shows: Earnings, Deductions, Net Pay |

### Step 5: Employee Management

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 5.1 | Click **Employees** in client menu | Client context | Employee list loads |
| 5.2 | **Add Single Employee**: Click **+ Add Employee** | Employee page | Form opens — fill Name, DOB, Aadhaar, PAN, Bank, Designation, Dept, CTC, Monthly Gross |
| 5.3 | **Bulk Import**: Click **Download Template** | Employee page | Excel template downloads (28 columns with dropdowns for Yes/No fields) |
| 5.4 | Fill template with employee data | Excel file | All columns filled — use Yes/No dropdowns for PF/ESI fields |
| 5.5 | Click **Upload** → Select filled file | Employee page | Import processes — shows count of imported/updated/skipped with warnings |

### Step 6: Create & Process Payroll Run

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 6.1 | Click **Payroll Runs** in client menu | Client context | Runs Console opens (`/payroll/clients/:id/runs`) |
| 6.2 | Click **Create Run** | Runs page | Modal: select month, year, branch |
| 6.3 | Click **Create** | Modal | Run created in DRAFT status, employees auto-seeded |
| 6.4 | Click **Upload Attendance** | Run detail | Upload Excel with columns: Employee Code, Name, Working Days, OT Hours |
| 6.5 | Review employee list — check days present, LOP | Run detail | Attendance reflected per employee |
| 6.6 | Click **Process** | Run detail | Engine calculates: BASIC, HRA, PF, ESI, PT, Net Pay for each employee |
| 6.7 | Review payslip breakdown per employee | Run detail | Component-wise breakup visible |
| 6.8 | Click **Submit for Approval** | Run detail | Status changes to SUBMITTED |
| 6.9 | Approver clicks **Approve** | Run detail | Status → APPROVED, payslips generated |

### Step 7: EL Accrual (Monthly)

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 7.1 | Go to **Setup** → **Leave / Pay Policy** tab | Setup page | EL Accrual section visible |
| 7.2 | Select Year and Month | EL Accrual section | Month/year chosen |
| 7.3 | Click **Run EL Accrual** | EL Accrual section | Processes: 1 EL credited per employee who worked ≥ 20 days |
| 7.4 | Review result message | EL Accrual section | Shows: X employees credited, Y skipped, Z already done |

### Step 8: Reports & Downloads

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 8.1 | Click **PF/ESI** in client menu | Client context | PF/ESI Dashboard with ECR, ESI reports |
| 8.2 | Click **Registers** in client menu | Client context | Download statutory registers (PF, ESI, PT, Wages) |
| 8.3 | Click **Reports** in sidebar | Global | Cross-client payroll reports |
| 8.4 | Use **TDS Calculator** / **Gratuity Calculator** | Sidebar tools | Quick calculations |

---

## 2. CRM Portal

**Role**: CRM  
**Login URL**: https://app.statcosol.com/login → Select "CRM"  
**Landing Page**: `/crm/dashboard`

### Step 1: Login & Dashboard

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 1.1 | Login with CRM credentials | Login page | CRM Dashboard loads |
| 1.2 | Review action items: pending tasks, overdue items, escalations | `/crm/dashboard` | Action dashboard with priorities |

### Step 2: Client Portfolio Management

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 2.1 | Click **Clients** in sidebar | Sidebar | Client list loads (`/crm/clients`) |
| 2.2 | Search or filter clients | Client list | Matching clients shown |
| 2.3 | Click a client name | Client list | Client Overview opens (`/crm/clients/:id/overview`) |
| 2.4 | Review client details: branches, compliance status, documents | Overview | Full client profile visible |

### Step 3: Branch & Contractor Management

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 3.1 | Click **Branches** in client context | Client submenu | List of branches for the client |
| 3.2 | Review branch compliance status | Branch list | Color-coded status indicators |
| 3.3 | Click **Contractors** in client context | Client submenu | Contractor list for the client |
| 3.4 | Review contractor documents and statuses | Contractor list | Document compliance visible |

### Step 4: Compliance Tracking

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 4.1 | Click **Compliance Tracker** in sidebar (cross-client) | Sidebar | All clients' compliance at a glance (`/crm/compliance-tracker`) |
| 4.2 | Or click **Compliance Tracker** in client context (single client) | Client submenu | Client-specific compliance items |
| 4.3 | Click **Compliance Tasks** | Sidebar | Task list with due dates, statuses |
| 4.4 | Mark tasks as done / escalate overdue items | Task detail | Status updated |

### Step 5: Document Review

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 5.1 | Click **Documents** in client context | Client submenu | Client documents list |
| 5.2 | Click **Compliance Docs** in client context | Client submenu | Compliance-specific documents |
| 5.3 | Click **Unit Documents** in client context | Client submenu | Unit-level documents |
| 5.4 | Click **Branch Docs Review** in sidebar | Sidebar | Review pending branch document uploads (`/crm/branch-docs-review`) |
| 5.5 | Approve or request re-upload | Doc review | Document status updated |

### Step 6: Registrations, Returns & Renewals

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 6.1 | Click **Registrations** in client context | Client submenu | Client registrations & licenses list |
| 6.2 | Click **Returns** in sidebar | Sidebar | Returns/Filings workspace (`/crm/returns`) |
| 6.3 | Track filing deadlines, mark as filed | Returns workspace | Filing status updated |
| 6.4 | Click **Renewals** in sidebar | Sidebar | Renewals workspace (`/crm/renewals`) |
| 6.5 | Track renewal dates, submit renewals | Renewals workspace | Renewal tracked |
| 6.6 | Click **Amendments** in sidebar | Sidebar | Amendments workspace (`/crm/amendments`) |
| 6.7 | Click **Expiry Tasks** in sidebar | Sidebar | Expiring items dashboard (`/crm/expiry-tasks`) |

### Step 7: Audit Management

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 7.1 | Click **Audits** in sidebar | Sidebar | Audit management page (`/crm/audits`) |
| 7.2 | Click **+ Schedule Audit** | Audit page | Create audit: select client, branch, type, date range, assign auditor |
| 7.3 | Click **Audit Monitoring** in sidebar | Sidebar | Monitor in-progress audits (`/crm/audit-monitoring`) |
| 7.4 | Review audit status, observations, reports | Monitoring | Audit progress visible |

### Step 8: Helpdesk & Communication

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 8.1 | Click **Helpdesk** in sidebar | Sidebar | Support tickets (`/crm/helpdesk`) |
| 8.2 | Respond to client/branch queries | Helpdesk | Ticket updated |
| 8.3 | Click **Notices** in sidebar | Sidebar | Create/manage notices for clients (`/crm/notices`) |

### Step 9: Analytics & Monitoring

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 9.1 | Click **Compliance Calendar** | Sidebar | Monthly/yearly compliance calendar view |
| 9.2 | Click **SLA Tracker** | Sidebar | SLA compliance metrics |
| 9.3 | Click **Risk Heatmap** | Sidebar | Visual risk assessment across clients |
| 9.4 | Click **Risk Trend** | Sidebar | Historical risk trend analysis |
| 9.5 | Click **Escalations** | Sidebar | Active escalations dashboard |
| 9.6 | Click **Reports** | Sidebar | Generate cross-client reports |

---

## 3. Audit Console

**Role**: AUDITOR  
**Login URL**: https://app.statcosol.com/login → Select "Auditor"  
**Landing Page**: `/auditor/dashboard`

### Step 1: Login & Dashboard

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 1.1 | Login with Auditor credentials | Login page | Auditor Dashboard loads |
| 1.2 | Review: assigned audits, pending observations, upcoming schedules | `/auditor/dashboard` | Summary metrics visible |

### Step 2: View Assigned Audits

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 2.1 | Click **Audits** in sidebar | Sidebar | Audit list loads (`/auditor/audits`) |
| 2.2 | Filter by status (Scheduled/In-Progress/Completed) | Audit list | Filtered results |
| 2.3 | Click an audit | Audit list | Audit Cockpit opens (`/auditor/audits/:id/workspace`) |

### Step 3: Conduct Audit (Audit Cockpit)

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 3.1 | Review audit details: client, branch, type, scope, date range | Cockpit header | Audit context visible |
| 3.2 | Review compliance items to audit | Cockpit checklist | Checklist of items |
| 3.3 | For each item: mark as Compliant / Non-Compliant / Not Applicable | Checklist | Status recorded |
| 3.4 | Upload evidence/documents for findings | Item detail | Files attached |
| 3.5 | Add observations for non-compliant items | Item detail | Observation created with category, severity, description |

### Step 4: Manage Observations

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 4.1 | Click **Observations** in sidebar | Sidebar | All observations across audits (`/auditor/observations`) |
| 4.2 | Filter by audit, status, severity | Observation list | Filtered results |
| 4.3 | Click an observation → **Verify** when corrective action taken | Observation detail | Status → VERIFIED |
| 4.4 | Or click **Reopen** if not satisfactorily resolved | Observation detail | Status → REOPENED |
| 4.5 | Export observations to Excel | Observation list | Excel file downloads |

### Step 5: Generate Audit Report

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 5.1 | Click **Reports** in sidebar | Sidebar | Reports list (`/auditor/reports`) |
| 5.2 | Select an audit → Click **Build Report** | Reports list | Report Builder opens (`/auditor/reports/:id/builder`) |
| 5.3 | Review auto-populated sections: summary, observations, compliance % | Report Builder | Report sections filled |
| 5.4 | Edit/customize sections as needed | Report Builder | Changes saved |
| 5.5 | Click **Generate / Download** | Report Builder | PDF/Excel report generated |

### Step 6: AI Audit Insights

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 6.1 | Click **AI Audit** in sidebar | Sidebar | AI Audit Insights page (`/auditor/ai-audit`) |
| 6.2 | Review AI-generated risk patterns and recommendations | AI page | Insights displayed |

---

## 4. Client Desk (LegitX)

**Role**: CLIENT  
**Login URL**: https://app.statcosol.com/login → Select "Client"  
**Landing Page**: `/client/dashboard`

### Step 1: Login & Dashboard

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 1.1 | Login with Client credentials | Login page | Client Dashboard loads |
| 1.2 | Review: compliance score, pending items, recent activities | `/client/dashboard` | Dashboard metrics visible |

### Step 2: Branch Management

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 2.1 | Click **Branches** in sidebar | Sidebar | All branches list (`/client/branches`) |
| 2.2 | Click a branch | Branch list | Branch Detail Workspace (`/client/branches/:id`) |
| 2.3 | Review branch compliance items | Branch detail | Compliance items for that branch |
| 2.4 | Review branch applicability matrix | Branch detail → Applicability | Which laws/items apply to this branch |

### Step 3: Employee Management

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 3.1 | Click **Employees** in sidebar | Sidebar | Employee list (`/client/employees`) |
| 3.2 | Click **+ Add Employee** | Employee page | Form: Name, DOB, Aadhaar, PAN, Bank, Designation, Department, CTC, Monthly Gross |
| 3.3 | Toggle "Type manually" for Designation/Department if not in master list | Form | Free text input enabled |
| 3.4 | **Bulk Import**: Download template → Fill → Upload | Employee page | 28-column Excel with validation dropdowns |
| 3.5 | Click an employee → View/Edit details | Employee list | Employee detail page |

### Step 4: Compliance Monitoring

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 4.1 | Click **Compliance Status** in sidebar | Sidebar | Overall compliance dashboard (`/client/compliance/status`) |
| 4.2 | Click **Monthly Compliance Documents** | Sidebar | MCD list (`/client/compliance/mcd`) |
| 4.3 | Click **Returns & Filings** | Sidebar | Returns tracking (`/client/compliance/returns`) |
| 4.4 | Click **Registrations & Licenses** | Sidebar | All registrations with expiry dates (`/client/compliance/registrations`) |
| 4.5 | Click **Document Library** | Sidebar | Searchable compliance document library (`/client/compliance/library`) |
| 4.6 | Click **Compliance Reminders** | Sidebar | Upcoming due dates (`/client/reminders`) |

### Step 5: Payroll Monitoring

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 5.1 | Click **Payroll** in sidebar | Sidebar | Payroll monitoring view (`/client/payroll`) |
| 5.2 | Review current month run status | Payroll page | Run status, employee count, totals visible |
| 5.3 | Click **CTC Summary** in sidebar | Sidebar | CTC breakdown across branches (`/client/ctc-summary`) |

### Step 6: Attendance Management

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 6.1 | Click **Attendance** in sidebar | Sidebar | Attendance Review (`/client/attendance`) |
| 6.2 | Select month, branch | Attendance page | Monthly attendance summary per employee |
| 6.3 | Click **Daily View** | Attendance page | Day-by-day attendance (`/client/attendance/daily`) |

### Step 7: Approvals

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 7.1 | Click **Approvals** in sidebar | Sidebar | Unified Approvals Center (`/client/approvals`) |
| 7.2 | Click **Leave Approvals** | Approvals submenu | Pending leave requests (`/client/approvals/leaves`) |
| 7.3 | Review request → Click **Approve** or **Reject** | Leave approval | Leave status updated, balance adjusted |
| 7.4 | Click **Nomination Approvals** | Approvals submenu | Pending nominations (`/client/approvals/nominations`) |

### Step 8: Audits & Reports

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 8.1 | Click **Audits** in sidebar | Sidebar | Audit results for your organization (`/client/audits`) |
| 8.2 | Click **Audit Summaries** | Sidebar | Summary view (`/client/audit-summaries`) |
| 8.3 | Click **Registers** | Sidebar | Download statutory registers (`/client/registers`) |

### Step 9: Other Features

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 9.1 | **Queries**: Submit support queries | `/client/queries` | Query submitted to CRM |
| 9.2 | **Master Data**: Manage departments, designations, grades | `/client/master-data` | Master lists maintained |
| 9.3 | **Unit Documents**: Upload/manage unit-level docs | `/client/unit-documents` | Documents organized |
| 9.4 | **Safety Matrix**: Safety compliance tracking | `/client/safety` | Safety items tracked |
| 9.5 | **Calendar**: Compliance calendar view | `/client/calendar` | Monthly calendar with due dates |
| 9.6 | **Risk Heatmap / SLA / Escalations**: Analytics | Sidebar | Visual compliance analytics |
| 9.7 | **News & Notices**: Read company news, notices | `/client/news`, `/client/notices` | Content displayed |

---

## 5. Branch Desk

**Role**: BRANCH (Branch User)  
**Login URL**: https://app.statcosol.com/login → Select "Branch"  
**Landing Page**: `/branch/dashboard`

### Step 1: Login & Dashboard

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 1.1 | Login with Branch credentials | Login page | Branch Dashboard loads |
| 1.2 | Review: pending uploads, compliance status, upcoming deadlines | `/branch/dashboard` | Branch-specific metrics |

### Step 2: Employee Management

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 2.1 | Click **Employees** in sidebar | Sidebar | Employee list for your branch (`/branch/employees`) |
| 2.2 | Click **+ Add Employee** | Employee page | Form: Name, DOB, Gender, Phone, Aadhaar, PAN, Bank, CTC, Monthly Gross |
| 2.3 | Toggle "Type manually" for Designation/Department if needed | Form | Free text input |
| 2.4 | **Bulk Import**: Download template → Fill → Upload | Employee page | Same 28-column template as Client |
| 2.5 | Click employee → View/Edit | Employee list | Employee detail/edit page |

### Step 3: Monthly Compliance Uploads

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 3.1 | Click **Monthly Compliance** in sidebar | Sidebar | Monthly Compliance Workbench (`/branch/compliance/monthly`) |
| 3.2 | Select month/year | Workbench | Compliance items for that month listed |
| 3.3 | For each item: Upload required document | Item row | File uploaded, status → UPLOADED |
| 3.4 | Add remarks if needed | Item row | Remarks saved |
| 3.5 | Submit for review | Workbench | Status → SUBMITTED for CRM review |

### Step 4: Periodic Uploads

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 4.1 | Click **Uploads** in sidebar | Sidebar | Periodic uploads page (`/branch/uploads`) |
| 4.2 | Select periodicity: Quarterly / Half-Yearly / Yearly | Uploads page | Relevant items shown |
| 4.3 | Upload documents for each required item | Item rows | Files attached |
| 4.4 | Click **Submit** | Uploads page | Sent for review |

### Step 5: Registrations & Licenses

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 5.1 | Click **Registrations** in sidebar | Sidebar | Branch registrations list (`/branch/registrations`) |
| 5.2 | View registration details, expiry dates | Registration list | Expiry warnings highlighted |
| 5.3 | Upload renewal documents when due | Registration detail | Document attached |

### Step 6: Attendance Management

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 6.1 | Click **Attendance** in sidebar | Sidebar | Attendance review for branch (`/branch/attendance`) |
| 6.2 | Select month | Attendance page | Monthly summary: Present, Absent, Half-Day, On Leave per employee |
| 6.3 | Click **Daily** for day-by-day view | Attendance page | Daily attendance grid (`/branch/attendance/daily`) |
| 6.4 | Mark/correct individual attendance | Daily view | Records updated |

### Step 7: Payroll & CTC

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 7.1 | Click **Payroll** in sidebar | Sidebar | Branch payroll view (`/branch/payroll`) |
| 7.2 | Review current month payroll status | Payroll page | Run status, employee breakup |
| 7.3 | Click **CTC Summary** | Sidebar | Branch CTC summary (`/branch/branch-ctc`) |

### Step 8: Audit Observations

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 8.1 | Click **Audit Observations** in sidebar | Sidebar | Non-compliances found in audits (`/branch/audits/observations`) |
| 8.2 | Review each observation | Observation list | Severity, category, description visible |
| 8.3 | Take corrective action and upload evidence | Observation detail | Action documented |

### Step 9: Documents & Reports

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 9.1 | Click **Documents** | Sidebar | Branch documents (`/branch/documents`) |
| 9.2 | Click **Reports** | Sidebar | Branch reports (`/branch/reports`) |
| 9.3 | Click **Compliance Items** | Sidebar | Applicable compliance items (`/branch/compliance-items`) |
| 9.4 | Click **Compliance Docs** | Sidebar | Compliance-specific docs (`/branch/compliance-docs`) |

### Step 10: Other Features

| # | Action | Where | Expected Result |
|---|--------|-------|-----------------|
| 10.1 | **Helpdesk**: Raise support tickets | `/branch/helpdesk` | Ticket submitted |
| 10.2 | **Notifications**: Check alerts | `/branch/notifications` | Notification list |
| 10.3 | **Contractors**: Manage branch contractors | `/branch/contractors` | Contractor list |
| 10.4 | **Calendar / SLA / Heatmap / Escalations**: Analytics | Sidebar | Visual dashboards |
| 10.5 | **Unit Documents**: Branch unit docs | `/branch/unit-documents` | Document management |
| 10.6 | **Safety**: Safety matrix compliance | `/branch/safety` | Safety items |
| 10.7 | **News & Notices**: Read updates | `/branch/news`, `/branch/notices` | Content displayed |

---

## Quick Reference: Key Payroll Rules

| Rule | Detail |
|------|--------|
| **PF Employee** | 12% of PF Wage (capped at ₹15,000) |
| **PF Employer** | 12% of PF Wage (capped at ₹15,000) |
| **PF Employer deducted from employee** | When gross > ₹25,000, PF_ER is also deducted from employee net pay |
| **EPS** | 8.33% of PF Wage (always capped at ₹15,000) |
| **ESI Employee** | 0.75% of ESI Wage (applicable when ESI Wage ≤ ₹21,000) |
| **ESI Employer** | 3.25% of ESI Wage (applicable when ESI Wage ≤ ₹21,000) |
| **Earned Leave** | 1 EL credited per month if employee worked ≥ 20 days |
| **Net Pay** | Gross − (PF_EMP + ESI_EMP + PT + LWF + PF_ER_FROM_EMP + other deductions) |

---

*Generated on April 14, 2026 — StatComPy Training Documentation*
