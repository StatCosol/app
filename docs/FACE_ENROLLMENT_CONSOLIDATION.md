# ADR: Face enrollment storage consolidation (mobile vs FaceDesk)

**Status:** Proposed — awaiting product decision  
**Date:** 2026-08-09  
**Context:** Face-attendance engineering track #485–#500 shipped review federation, roster crypto, and V1 kiosk restore. Enrollment storage remains split.

## Problem

StatComPy stores employee/contractor face enrollments in **two parallel schemas**:

| Track | Employee table | Contractor table | Capture surfaces |
|-------|----------------|------------------|------------------|
| **Mobile attendance** | `face_enrollments` (PK = `employee_id`) | `contractor_face_enrollments` | ESS self-enroll, branch supervised enroll, V1 offline 1:N kiosk roster |
| **FaceDesk V2** | `facedesk_employee_face_profiles` + `facedesk_employee_face_samples` | FaceDesk contractor profile tables | PIN+face shared kiosk, admin enrollment portal |

Operators with **both** `MOBILE_ATTENDANCE` and `CONTRACTOR_FACE_ATTENDANCE` see two enrollment admin surfaces and two embedding stores for the same person if both stacks are provisioned.

## Why not merge today

1. **Different embedding pipelines** — Mobile uses single `bytea` embedding on `face_enrollments`; FaceDesk uses profile + multi-sample gallery with quality/liveness/duplicate metadata and optional ArcFace re-embed on server.
2. **PIN is FaceDesk-only** — `attendance_pin_hash` / `attendance_pin_lookup` exist only on `facedesk_employee_face_profiles`. Mobile 1:N matching does not use PIN.
3. **Consent audit shape** — Mobile stores `consent_given_at` / `consent_given_by` on `face_enrollments`; FaceDesk tracks enrollment status, duplicate alerts, and sample-level audit separately.
4. **Re-enrollment queues** — `face_reenrollment_requests` vs FaceDesk enroll tickets / pending enrollment flows are not unified.
5. **Live clients** — Some sites run mobile-only (ESS phones), some FaceDesk-only (shared tablet), some both. A hard cutover risks breaking roster download, PIN lookup, or ESS self-enroll mid-payroll.

## Options

### A. Keep separate (status quo + documentation)

- **Pros:** Zero migration risk; each stack optimizes for its capture mode.
- **Cons:** Dual admin UX; no single “is this employee face-enrolled?” API without federation.
- **When to choose:** Clients rarely buy both modules; product accepts parallel stacks indefinitely.

### B. Federated read layer only (recommended near-term)

- **What:** Add `GET /api/v1/face-enrollment/status` (or extend existing client APIs) that unions mobile + FaceDesk enrollment state per employee without moving `bytea` storage.
- **Pros:** Small engineering cost; matches review federation pattern (#499–#500).
- **Cons:** Writes still go to two places; re-enroll still duplicated.
- **When to choose:** Product wants operator clarity now, consolidation later.

### C. FaceDesk as system of record for shared kiosks; mobile for ESS-only

- **What:** New ESS enrollments write only to `face_enrollments`. FaceDesk kiosk enrollments write only to `facedesk_*`. Cross-read via federation; no merge.
- **Pros:** Clear ownership boundary; minimal schema change.
- **Cons:** Employees who punch on **both** ESS phone and FaceDesk tablet need two enrollments until dual-write is added.

### D. Unified `face_subjects` table (full consolidation)

- **What:** New normalized table: `face_subject_id`, `client_id`, `subject_type`, `subject_id`, `embedding_model`, `primary_embedding`, `enrollment_source`, `consent_*`, optional PIN columns, `status`. Backfill from both legacy tables; dual-write; deprecate old APIs over 2+ releases.
- **Pros:** Single source of truth; simpler roster generation; one re-enroll queue possible.
- **Cons:** Large migration; embedding model mismatches must be re-captured or converted; contractor paths; downtime risk.
- **When to choose:** Product mandates one enrollment admin UI and is willing to fund migration + client comms.

## Recommended phased path (if product approves consolidation)

| Phase | Scope | Rollback |
|-------|--------|----------|
| **0** | This ADR + operator docs (`ATTENDANCE_SYSTEMS.md`) | N/A |
| **1** | Federated enrollment **read** API + client “enrollment status” column | Disable endpoint |
| **2** | Dual-write on new enroll (feature flag per client) | Flag off |
| **3** | Backfill job: copy mobile → unified or FaceDesk → unified with `embedding_model` tag | Restore from legacy tables (keep read-only copies) |
| **4** | Switch roster + FaceDesk gallery to unified read; deprecate legacy write APIs | Re-enable legacy writers |
| **5** | Drop legacy tables after 90-day read-only period | Restore from backup |

**Do not start Phase 2+ without explicit product sign-off and per-client rollout list.**

## Open questions for product

1. Must a single employee support **both** ESS phone punch and FaceDesk kiosk punch with **one** enrollment?
2. Is PIN mandatory for all shared-kiosk clients, or will some move to mobile-style 1:N only?
3. Are embedding model upgrades (MobileFaceNet vs ArcFace) acceptable to force re-capture during migration?
4. Which portal is the long-term **admin** surface for enrollment status — ESS Mobile Attendance, Kiosk Attendance, or a new unified page?

## Engineering references

- Mobile: `backend/src/mobile-attendance/enrollment/`, `face_enrollments`
- FaceDesk: `backend/src/facedesk/facedesk-enrollment.service.ts`, `facedesk_employee_face_profiles`
- Review federation (pattern): `backend/src/mobile-attendance/punch/attendance-review-federation.service.ts`
- Architecture overview: `docs/ATTENDANCE_SYSTEMS.md`

## Decision log

| Date | Decision |
|------|----------|
| 2026-08-09 | ADR drafted; **no schema merge** until product answers open questions |
