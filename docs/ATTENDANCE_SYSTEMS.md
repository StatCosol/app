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

## Face attendance capture tracks (mobile + FaceDesk)

StatComPy currently runs **two parallel face stacks**. Do not merge storage without an explicit migration plan.

| Track | Enrollment storage | Punch review queue | Primary clients |
|-------|-------------------|--------------------|-----------------|
| **Mobile attendance V1/V2** | `face_enrollments`, `contractor_face_enrollments` | `mobile_attendance_punches` / `contractor_biometric_punches` with `REVIEW_PENDING` | ESS phones, offline 1:N kiosk (`KioskActivity`) |
| **FaceDesk V2** | `facedesk_employee_face_profiles`, contractor FaceDesk tables | `facedesk_attendance_review_queue` (PIN correct / face mismatch) | PIN+face shared kiosk |

### Operator review UX (R3)
- **Borderline 1:N cosine matches** (held automatically): Client portal → **ESS Mobile Attendance → Punch Review**.
- **PIN correct / face mismatch** (FaceDesk): Client or branch portal → **Kiosk Attendance → Review Queue / Verifications**.
- Cross-links exist in both UIs when the destination module is enabled; queues remain separate because issue types and APIs differ.
- **Federated read API:** `GET /api/v1/mobile-attendance/review-federation` returns a merged, entitlement-aware summary + item list with `portalPath` deep links (including `?tab=review`). FaceDesk rows are limited to `FACE_MISMATCH` attendance verifications; mobile rows are ESS employee punches only.
- **Unified review inbox (dual-module clients):** ESS Mobile Attendance → Punch Review shows a federated summary badge plus a read-only FaceDesk verification table with deep links. Approve/reject still uses each queue's native APIs.

### Consolidation blockers (product decision required)
1. **Enrollment tables** — `face_enrollments` vs `facedesk_employee_face_profiles` (different embedding models, consent audit, contractor paths).
2. **Review queues** — federated read API and dual-module inbox shipped; single approve/reject handler across both queues remains future work.
3. **Offline kiosk** — V1 roster path restored on Android (`#496`); FaceDesk remains the default provision flow for new shared tablets.
