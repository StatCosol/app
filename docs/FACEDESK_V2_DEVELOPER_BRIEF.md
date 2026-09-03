# FaceDesk V2 - StatCo Smart Attendance Kiosk

## Objective

FaceDesk V2 is the **production** shared-kiosk attendance module. It separates employee face enrollment from attendance capture so admin-controlled registration and employee self-service punching never share the same screen.

Legacy **V1 offline roster kiosk** (`KioskActivity` + mobile-attendance roster) remains in the APK for migration only. New sites should provision **FaceDesk devices** in the portal.

## Core Rule

Enrollment and attendance must never be mixed on the same screen.

- Enrollment is admin/security/HR controlled.
- Attendance is employee self-service with a full-screen camera.
- Low-confidence or duplicate cases go to admin review instead of guessing.

## Menus

- FaceDesk Dashboard
- Device Management
- Employee Enrollment
- Attendance Kiosk
- Failed Attempts
- Duplicate Alerts
- Review Queue
- Manual Corrections
- Reports
- Payroll Sync
- Settings

## Enrollment Flow

1. Admin logs in and selects branch.
2. System shows pending employees.
3. Admin selects one employee.
4. Camera opens for that employee only.
5. Capture 10-15 frames.
6. Select best 5 samples.
7. Validate lighting, blur, face size, angle, eyes, and obstruction.
8. Run liveness challenge.
9. Compare against all enrolled faces.
10. If duplicate is found, block save and create duplicate alert.
11. If clean, save profile and samples.
12. Move to next employee.

## Attendance Flow

1. Employee stands before kiosk.
2. Camera auto-detects face.
3. Capture 10-15 frames quickly.
4. Select best 3 frames.
5. Match against enrolled templates.
6. Confidence >= 95: mark attendance.
7. Confidence 90-95: ask employee to retry.
8. Confidence below 90: show "Face not recognized".
9. Multiple close matches: create review item.

The attendance screen must not show employee list, search box, dropdown, or manual employee selection.

## User Messages

Use clear operator messages instead of technical errors.

- Please look at camera
- Move closer
- Too dark
- Face not clear
- Look straight
- Attendance marked
- Already marked
- Face not recognized
- Possible duplicate found
- Please contact admin
- Offline attendance saved

## Confidence Settings

Portal settings use **display percentages** (e.g. 95% accept). The matcher uses **calibrated cosine** thresholds — see `backend/.env.example` (`FD_COSINE_AT_95=0.84`, etc.) and `FaceDeskSettingsService.percentToCosine()`.

Typical defaults (percent → effective cosine):

- Match confidence: **95%** → ~0.84 accept
- Retry confidence: **90%** → ~0.78 retry band
- Duplicate threshold: **97%** → ~0.88 block enrollment duplicates
- Min face samples: **5**
- Frame capture count: **15**
- Offline sync: **enabled** for `PIN_THEN_FACE` only (`FACE_ONLY` has no offline fallback)

## Admin Review Queue

Review queue receives:

- Duplicate enrollment alerts
- Low-confidence attendance
- Multiple-match attendance
- Repeated failed attempts
- Manual correction requests

Admin actions:

- Approve
- Reject
- Reassign employee
- Ask for re-enrollment
- Mark as false alert

## Payroll Integration

Only approved attendance should flow into payroll.

Flow:

FaceDesk attendance logs -> validation/review -> attendance register -> PayDek/payroll -> reports

## Security Requirements

- Encrypt face templates.
- Do not expose face images publicly.
- Maintain employee consent.
- Maintain audit logs for enrollment, re-enrollment, approval, rejection, correction, and deletion.
- Map devices by device id and branch.
- Support branch-wise access.
- Support face data delete on employee exit.

## Phase Plan

### Phase 1 - UI Separation

- Create FaceDesk Attendance screen.
- Create FaceDesk Enrollment screen.
- Keep V1 kiosk unchanged until V2 is complete.
- Remove employee lists from attendance.
- Use one-employee-at-a-time enrollment.

### Phase 2 - Accuracy

- Multi-frame capture.
- Best-frame selection.
- Quality checks.
- Duplicate detection.
- Confidence bands.

### Phase 3 - Reliability

- Liveness challenge.
- Offline attendance queue.
- Admin review queue.
- Device online/offline monitoring.

### Phase 4 - Productization

- Reports.
- Payroll export.
- Branch dashboard.
- Contractor attendance.
