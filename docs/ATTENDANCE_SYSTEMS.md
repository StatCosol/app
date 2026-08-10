# Attendance Systems Architecture

StatComPy currently has **four attendance subsystems**. They serve different portals and should not be merged without a phased migration plan.

## 1. Core attendance (`backend/src/attendance/`)
- **API:** `/api/v1/attendance/*`, holiday calendars
- **Users:** Client HR, branch mark-attendance, payroll input validation
- **Storage:** `attendance_records`, policies, holidays
- **FE:** Branch mark-attendance, client dashboards, payroll processing

## 2. Shared mobile-attendance backend (`backend/src/mobile-attendance/`)
- **API:** `/api/v1/mobile-attendance/*` (legacy shared routes — **not** the retired ESS phone product)
- **Users:** FaceDesk kiosk device registry, contractor biometric punches, legacy V1 offline kiosk (`KioskActivity`)
- **Storage:** `mobile_attendance_devices` (KIOSK mode), `contractor_biometric_punches`, `face_enrollments` (legacy — deactivated for employees)
- **Retired (2026-08):** ESS Mobile Attendance personal-phone module (`MOBILE_ATTENDANCE`) — UI removed, ESS devices revoked, employee self-enroll and punch-review APIs blocked

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

## ESS portal attendance (separate from mobile-attendance)
- **API:** `/api/v1/ess/attendance/*` (check-in/out with geolocation)
- **Users:** ESS web (`/app/ess/*`) and `:essportal` Android WebView
- **Storage:** `ess_attendance_punches`, `attendance_records`

## Consolidation guidance (future)
1. Keep **core attendance** as source of truth for permanent employees.
2. **ESS portal** self check-in/out syncs into `attendance_records`.
3. **Contractor computation** sheets are payroll-input artifacts — do not merge into CLRA.
4. **CLRA** attendance is statutory register data per deployment — keep separate unless PE establishment adopts core attendance for contract workers.

## Shared concepts
- Month/period scoping uses `YYYY-MM` or wage-period dates depending on subsystem.
- Payroll run processing reads core attendance + leave ledger; CLRA wages use CLRA attendance only.

## Face attendance capture tracks (FaceDesk + legacy mobile backend)

| Track | Enrollment storage | Punch review queue | Primary clients |
|-------|-------------------|--------------------|-----------------|
| **FaceDesk V2** (supported) | `facedesk_employee_face_profiles` | `facedesk_attendance_review_queue` | PIN+face shared kiosk |
| **Legacy mobile backend** (contractor + V1 kiosk only) | `contractor_face_enrollments`, deactivated `face_enrollments` | `contractor_biometric_punches` with `REVIEW_PENDING` | Contractor attendance, legacy V1 offline kiosk |
| **ESS Mobile Attendance** (retired) | `face_enrollments` (deactivated) | `mobile_attendance_punches` (closed) | — |

### Operator review UX
- **PIN correct / face mismatch (FaceDesk):** Client or branch portal → **Kiosk Attendance → Review Queue / Verifications**.
- **Contractor borderline punches:** Contractor attendance workflows via `CONTRACTOR_ATTENDANCE` module (if enabled).
- **Federation APIs:** `GET /api/v1/mobile-attendance/review-federation` and `enrollment-federation` remain for FaceDesk clients; mobile employee rows are no longer included.

### Supported products (2026-08)
| Product | Status |
|---------|--------|
| FaceDesk kiosk (PIN + face) | **Required** — `/api/v1/facedesk/*` |
| ESS portal web + app | **Required** — `/api/v1/ess/*` |
| ESS Mobile Attendance (personal phone) | **Retired** |
