# Face Attendance System - Executive Summary

Date: 2026-06-13
Status: Critical production issue

## Problem

The shared-kiosk face attendance system has repeatedly failed in production:

- Clean-shave employees are recognized more reliably than employees with beard or moustache changes.
- One employee face has been accepted for another employee.
- Some dark-skin employees are incorrectly shown as duplicate or already registered.
- Attendance was captured too soon after enrollment.
- Low-quality or wrong enrollment templates can poison future matching.

Attendance from the shared kiosk is not reliable enough for payroll until the remediation is completed and tested.

## Current Action

Live shared-kiosk attendance must stay stopped. The hotfix adds a server-side stop switch and keeps it off by default:

```bash
FACE_KIOSK_LIVE_ATTENDANCE_ENABLED=false
```

This blocks live kiosk punches even if a device still attempts to submit attendance.

## What Is Already Correct

- Server-side probe re-verification exists.
- Duplicate detection exists across active and pending enrollments.
- Kiosk enrollment uses admin approval tickets.
- Liveness challenge exists for punches.
- Audit logging exists for duplicate and failed face events.

## What Was Hardened

- Kiosk live attendance defaults OFF.
- Minimum auto-accept face match score is now 0.90.
- Liveness threshold is now 0.7.
- Enrollment quality threshold default is now 0.75.
- Duplicate threshold default is now 0.88.
- Kiosk enrollment capture now requires 7 frames.
- Kiosk enrollment now requires a server-issued liveness challenge.
- Shared-kiosk roster hides newly enrolled faces during activation hold.
- Punch API rejects kiosk attendance during activation hold.
- Ambiguous 1:N device matches require a stronger first-vs-second score gap.
- VEIHAY pending-code cleanup script is included as dry-run first.

## Go-Live Recommendation

Use a phased approach:

1. Keep kiosk live attendance disabled.
2. Clean stale pending/duplicate face data.
3. Re-enroll affected employees under fixed lighting.
4. Deploy backend hotfix and kiosk APK together.
5. Run controlled tests with similar-looking employees, dark-skin employees, beard/moustache cases, and spectacles.
6. Enable kiosk only after sign-off.

## Required Sign-Off

- Operations: alternate attendance active.
- HR: affected records reviewed.
- Engineering: hotfix deployed and logs monitored.
- QA: acceptance checklist completed.
- Management: live re-enable approved.
