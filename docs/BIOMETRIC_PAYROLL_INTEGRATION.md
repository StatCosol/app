# Biometric (eSSL/ZKTeco) → Attendance → Payroll Integration

End-to-end guide for integrating an eSSL/ZKTeco biometric machine with Statcompy
so that punches automatically flow into payroll.

> **Backend version:** `backend-live-041223e-20260428-030338` or later.
> **Protocol:** ZK/eSSL **iclock ADMS** (HTTP push). No middleware, no SDK install.

---

## 1. Architecture overview

```
┌──────────────┐  HTTP push    ┌────────────────────────────┐
│  eSSL Device │ ───TSV──────▶ │  /iclock/cdata?SN=...      │  (no JWT, public)
│  (K90, X990, │               │  EsslIclockController      │
│   etc.)      │ ◀──ack──────── │  EsslService.ingestAttlog  │
└──────────────┘                └─────────────┬──────────────┘
                                              │
                                              ▼
                              ┌──────────────────────────────┐
                              │  biometric_punches           │
                              │  (raw audit trail, dedup'd)  │
                              └─────────────┬────────────────┘
                                            │ processAffectedDays
                                            ▼
                              ┌──────────────────────────────┐
                              │  attendance_records          │
                              │  status=PRESENT, source=BIOMETRIC,
                              │  approval_status=APPROVED,   │
                              │  worked_hours, overtime_hours│
                              └─────────────┬────────────────┘
                                            │  attendanceService.getMonthlySummary
                                            │  (approvedOnly = true)
                                            ▼
                              ┌──────────────────────────────┐
                              │  payroll_run_employees       │
                              │  days_present, lop_days,     │
                              │  ot_hours → engine formulas  │
                              │  → gross / OT pay / net      │
                              └──────────────────────────────┘
```

Two database tables, three services, no extra infra:

| Table                | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| `biometric_devices`  | One row per machine. SN-authenticated. Per-client/branch.|
| `biometric_punches`  | Every raw scan. Idempotent on (client, code, time, SN).  |
| `attendance_records` | Daily roll-up the payroll engine reads (existing table). |

---

## 2. One-time backend prep

Already done by the deployed backend on container start:

- Migration `20260428_biometric_punches.sql` — punches table.
- Migration `20260428_biometric_devices.sql` — device registry.
- `/iclock/*` excluded from `/api` global prefix and the JWT guard.
- `bodyParser.text()` mounted on `/iclock` so TSV bodies parse correctly.

You only need to do the per-device steps below.

---

## 3. Step-by-step integration

### Step 1 — Register the device in Statcompy

Sign in as a CLIENT, ADMIN, or CRM user, then call:

```http
POST /api/v1/client/biometric/devices
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "serialNumber": "ABCD1234567",        // exact SN printed on the device
  "branchId":     "<uuid-of-branch>",   // optional but recommended
  "vendor":       "ESSL",               // or "ZKTECO"
  "model":        "K90",
  "label":        "Main Gate K90"
}
```

Response includes a `pushToken` (kept for future stronger auth — currently SN
alone is enough). The device row is created `enabled: true`.

To list / disable / rotate token / delete:

```
GET    /api/v1/client/biometric/devices
PATCH  /api/v1/client/biometric/devices/:id          { enabled: false }
POST   /api/v1/client/biometric/devices/:id/rotate-token
DELETE /api/v1/client/biometric/devices/:id
```

### Step 2 — Make sure every employee has an `employeeCode`

The eSSL device sends only the **PIN** (employee number you enrolled on the
machine). That PIN must equal `employees.employee_code` in Statcompy.

Best practice: enroll on the device using the same code already used in HR
master (e.g. `EMP0042`). If they don't match, the punch is still saved with
`employee_id = NULL` and can be linked later via:

```http
POST /api/v1/client/biometric/reconcile
```

…once you fix the mismatch in either system.

### Step 3 — Configure the eSSL device

On the machine: **Menu → Comm → Cloud Server Setting** (label varies by model;
on some it is **Comm → Webserver** or **WebSetup**).

| Field                | Value                                          |
| -------------------- | ---------------------------------------------- |
| Enable Domain Name   | **Yes**                                        |
| Server Mode          | **ADMS** (or "HTTP")                           |
| Server Address       | `api.statcosol.com`                            |
| Server Port          | `443` (HTTPS) — or `80` for HTTP               |
| HTTPS                | **Yes** (recommended)                          |
| Proxy                | None                                           |
| Heartbeat            | `10` sec (default)                             |
| Realtime upload      | **Yes**                                        |

Save and **reboot** the device. Within ~30 seconds it hits
`GET /iclock/cdata?SN=...&options=all` and our backend replies with the
session config. From then on, every punch is pushed within `Heartbeat` seconds.

> Verify: `GET https://api.statcosol.com/iclock/ping` should return `OK`.

### Step 4 — First punch — sanity check

1. Punch a finger / face on the device.
2. Within ~10 s, check Statcompy:

   ```http
   GET /api/v1/client/biometric/punches?from=2026-04-28&to=2026-04-28
   Authorization: Bearer <JWT>
   ```

3. You should see a row with your `employeeCode`, `punchTime`, `direction`,
   `deviceId = <serial>`, `processedAt = <timestamp>`.

4. The corresponding day in **Mark Attendance** (Branch portal) now shows the
   employee with `source = BIOMETRIC`, `checkIn`, `checkOut`, `workedHours`,
   `overtimeHours`, and `approvalStatus = APPROVED`.

### Step 5 — Backfill / replay (optional)

If the device was offline, its internal log is pushed automatically on
reconnect. To force a re-aggregation of a date range (e.g. after fixing an
employee code):

```http
POST /api/v1/client/biometric/process
{ "from": "2026-04-01", "to": "2026-04-30", "reprocess": true }
```

---

## 4. How a punch becomes a payroll line

This is the full lifecycle of one fingerprint punch:

### 4.1  Device → `biometric_punches`

`EsslIclockController.pushData` receives the TSV body for table `ATTLOG`:

```
0042<TAB>2026-04-28 09:01:14<TAB>0<TAB>1<TAB>0<TAB>0
0099<TAB>2026-04-28 09:03:42<TAB>0<TAB>1<TAB>0<TAB>0
```

`EsslService.ingestAttlog` parses each line:
- Column 0 → `employeeCode` (PIN)
- Column 1 → device-local datetime, converted to UTC using the device's
  `tzOffsetMinutes` from `biometric_devices.meta` (default IST = +330)
- Column 2 → status code → `direction`:
  - `0` / `4` → `IN`
  - `1` / `5` → `OUT`
  - anything else → `AUTO`

`BiometricService.ingest` then:

1. Looks up employees by `employeeCode` (one query, `IN (...)`).
2. Bulk-inserts rows into `biometric_punches` with `.orIgnore()` against the
   unique index `(client_id, employee_code, punch_time, device_id)`. Replays
   are silently de-duplicated.
3. Tracks `(employeeId, dateUTC)` pairs that were touched.
4. Calls `processAffectedDays(...)` automatically (because the device sends
   `autoProcess` defaulted to `true`).

### 4.2  `biometric_punches` → `attendance_records`

`processAffectedDays` runs per `(employee, date)`:

| Field             | Computation                                                  |
| ----------------- | ------------------------------------------------------------ |
| `status`          | `'PRESENT'`                                                  |
| `checkIn`         | earliest punch time of the day (UTC `HH:mm:ss`)              |
| `checkOut`        | latest punch time of the day (or `null` if only one punch)   |
| `workedHours`     | `(checkOut − checkIn)` in hours, rounded to 2 dp             |
| `overtimeHours`   | `max(0, workedHours − 9)` (STANDARD\_HOURS = 9)              |
| `source`          | `'BIOMETRIC'`                                                |
| `captureMethod`   | `'BIOMETRIC'`                                                |
| `approvalStatus`  | `'APPROVED'` *(device-verified — bypasses manual approval)*  |

Then it writes the `attendance_records` row (insert or update) and stamps
`processed_at = now()` + `attendance_id` on the originating punches.

**Manual edits win.** If a row already has `source = 'MANUAL'` AND a `checkIn`
value, the biometric processor leaves it alone. So a branch admin can
override a bad scan by editing in the UI; the next push won't clobber it.

### 4.3  `attendance_records` → payroll engine

When you process a payroll run for the period, `PayrollEngineService.process`:

1. Calls `attendanceService.getMonthlySummary({ clientId, year, month, approvedOnly: true })`.
   This SQL aggregates per employee over the month:
   - `daysPresent = COUNT(status='PRESENT') + COUNT(status='HALF_DAY') * 0.5`
   - `lopDays    = totalDays − present − holidays − weekOffs − leaves`
   - `totalOvertimeHours = SUM(overtime_hours)`
2. Seeds component values for each employee (unless overridden by an
   uploaded attendance Excel):
   - `LOP_DAYS` ← `attendance.lopDays`
   - `NCP_DAYS` ← `attendance.lopDays`
   - `OT_HOURS` ← `attendance.totalOvertimeHours`
   - `WORKED_DAYS` ← `attendance.effectivePresent`
3. Stores them on `payroll_run_employees`:
   - `total_days`, `days_present`, `lop_days`, `ncp_days`, `ot_hours`.
4. Runs the salary-structure formula engine with those values. Typical wiring:
   ```
   GROSS  = BASIC + HRA + ...      (uses WORKED_DAYS / TOTAL_DAYS to prorate)
   OT_PAY = OT_HOURS * (BASIC / 26 / 8) * 2     (or whatever your rule is)
   NET    = GROSS + OT_PAY − DEDUCTIONS
   ```

### 4.4  Payroll outputs that consume biometric data

| Report / register            | Field driven by biometric                  |
| ---------------------------- | ------------------------------------------ |
| Salary register (PDF / XLSX) | Days Present, LOP Days, OT Hours, OT Pay   |
| Form 16 / Form 24Q etc.      | Days worked → PF/ESI base proration        |
| Overtime register            | OT Hours per employee per day              |
| Statutory returns            | NCP days = LOP days                        |
| Branch attendance Excel      | Already shows daily check-in / check-out   |

---

## 5. Operational checklist

| When                  | Action                                                                      |
| --------------------- | --------------------------------------------------------------------------- |
| New device            | `POST /devices` → configure Cloud Server on machine → reboot → punch test.  |
| New employee          | Enroll on device with **same** code as `employees.employee_code`.           |
| Code mismatch         | Fix the master data, then `POST /reconcile`.                                |
| Device offline a day  | Nothing — device pushes its buffered log on reconnect; idempotent.          |
| Wrong scan / overtime | Edit the day in Mark Attendance UI → row becomes `source=MANUAL`, locked.  |
| Reprocess range       | `POST /process { from, to, reprocess: true }`.                              |
| Decommission machine  | `PATCH /devices/:id { enabled:false }` or `DELETE`.                         |

---

## 6. Endpoint reference

### Public — for the device only (no auth)

| Method | Path                                | Purpose                          |
| ------ | ----------------------------------- | -------------------------------- |
| GET    | `/iclock/ping`                      | Liveness                         |
| GET    | `/iclock/cdata?SN=…&options=all`    | Handshake config                 |
| POST   | `/iclock/cdata?SN=…&table=ATTLOG`   | Attendance push (TSV body)       |
| POST   | `/iclock/cdata?SN=…&table=OPERLOG`  | User/device events (ack only)    |
| GET    | `/iclock/getrequest?SN=…`           | Command poll                     |
| POST   | `/iclock/devicecmd?SN=…`            | Command ack                      |

### Authenticated (CLIENT / ADMIN / CRM)

| Method | Path                                                       |
| ------ | ---------------------------------------------------------- |
| GET    | `/api/v1/client/biometric/devices`                         |
| POST   | `/api/v1/client/biometric/devices`                         |
| PATCH  | `/api/v1/client/biometric/devices/:id`                     |
| POST   | `/api/v1/client/biometric/devices/:id/rotate-token`        |
| DELETE | `/api/v1/client/biometric/devices/:id`                     |
| POST   | `/api/v1/client/biometric/punches/ingest`                  |
| GET    | `/api/v1/client/biometric/punches?from=&to=&…`             |
| POST   | `/api/v1/client/biometric/process`                         |
| POST   | `/api/v1/client/biometric/reconcile`                       |

---

## 7. Troubleshooting

| Symptom                                   | Cause / fix                                                       |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `401 Device not registered` in logs       | SN missing from `biometric_devices` or `enabled=false`.            |
| Punches arrive but employee shows blank   | `employeeCode` ≠ `employees.employee_code`. Fix + `/reconcile`.   |
| Times look 5h30m off                      | Device tz wrong. Set `meta.tzOffsetMinutes` on the device row.    |
| Day shows checkIn but no checkOut         | Only one punch received (employee forgot to punch out).           |
| OT hours = 0 in payroll                   | `workedHours ≤ 9`, OR `attendance.approvalStatus` ≠ APPROVED.     |
| Manual edit got overwritten               | Manual row was missing a `checkIn`. Set both check-in + check-out.|
| Device says “upload failed”               | Wrong server IP / port; or HTTPS without valid cert. Try HTTP 80. |

---

## 8. Future enhancements (not in this release)

- Push employee enrollment **down** to the device (so HR can add/remove on the
  web and the device syncs).
- Frontend screen to register devices and view live punch feed.
- Per-shift OT rules (currently fixed at >9h).
- Face-template management / photo capture on punch.
- Stricter device auth using rotated `pushToken` (already stored, not yet
  required by the iclock endpoint).
