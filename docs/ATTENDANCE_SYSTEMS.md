# Attendance Systems Architecture

StatComPy currently has **four attendance subsystems**. They serve different portals and should not be merged without a phased migration plan.

## 1. Core attendance (`backend/src/attendance/`)
- **API:** `/api/v1/attendance/*`, holiday calendars
- **Users:** Client HR, branch mark-attendance, payroll input validation
- **Storage:** `attendance_records`, policies, holidays
- **FE:** Branch mark-attendance, client dashboards, payroll processing

## 2. Mobile attendance (`backend/src/mobile-attendance/`)
- **API:** `/api/v1/mobile-attendance/*`
- **Users:** ESS mobile app, face enrollment kiosks
- **Storage:** Punches, face enrollment, geo fences
- **FE:** `client-mobile-attendance`, branch face enrollment

## 3. Contractor computation attendance (`backend/src/contractor/`)
- **API:** `/api/v1/contractor/computation/attendance/upload`
- **Users:** Contractor portal payroll computation
- **Storage:** Uploaded sheets tied to MCD computation runs
- **FE:** Contractor payroll computation page

## 4. CLRA attendance (`backend/src/contractor/clra-*`)
- **API:** `/api/v1/clra/attendance` (upsert per wage period + deployment)
- **Users:** CRM CLRA workspace, contractor CLRA self-service
- **Storage:** `clra_attendance` linked to wage periods
- **FE:** Assignment detail → Attendance tab

## Consolidation guidance (future)
1. Keep **core attendance** as source of truth for permanent employees.
2. **Mobile** remains the capture channel for ESS; sync into core attendance tables.
3. **Contractor computation** sheets are payroll-input artifacts — do not merge into CLRA.
4. **CLRA** attendance is statutory register data per deployment — keep separate unless PE establishment adopts core attendance for contract workers.

## Shared concepts
- Month/period scoping uses `YYYY-MM` or wage-period dates depending on subsystem.
- Payroll run processing reads core attendance + leave ledger; CLRA wages use CLRA attendance only.
