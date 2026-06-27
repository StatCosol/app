-- ============================================================
-- Contractor Payroll: attendance uploads, wage sheets
-- ============================================================

-- 1. Add basic_da_pct to contractor_employees
--    (Basic+DA as % of monthly gross — used for PF calculation)
ALTER TABLE contractor_employees
  ADD COLUMN IF NOT EXISTS basic_da_pct SMALLINT NOT NULL DEFAULT 50;

-- 2. Track each attendance file upload from a contractor
CREATE TABLE IF NOT EXISTS contractor_attendance_uploads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL,
  branch_id       UUID,
  contractor_user_id UUID NOT NULL,
  month           SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year            SMALLINT NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  file_url        TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'DONE'
                    CHECK (status IN ('PROCESSING','DONE','FAILED')),
  rows_processed  INTEGER NOT NULL DEFAULT 0,
  error_summary   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS IDX_CAU_CLIENT_MONTH
  ON contractor_attendance_uploads (client_id, year, month);

-- 3. Per-employee per-day attendance rows (source: UPLOAD or KIOSK-derived)
CREATE TABLE IF NOT EXISTS contractor_attendance_records (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id               UUID REFERENCES contractor_attendance_uploads(id) ON DELETE CASCADE,
  contractor_employee_id  UUID NOT NULL,
  client_id               UUID NOT NULL,
  branch_id               UUID,
  attendance_date         DATE NOT NULL,
  status                  VARCHAR(10) NOT NULL DEFAULT 'PRESENT'
                            CHECK (status IN ('PRESENT','ABSENT','HALF_DAY')),
  source                  VARCHAR(10) NOT NULL DEFAULT 'UPLOAD'
                            CHECK (source IN ('UPLOAD','KIOSK')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contractor_employee_id, attendance_date, source)
);

CREATE INDEX IF NOT EXISTS IDX_CAR_EMP_DATE
  ON contractor_attendance_records (contractor_employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS IDX_CAR_CLIENT_MONTH
  ON contractor_attendance_records (client_id, date_trunc('month', attendance_date));

-- 4. Monthly wage sheet header
CREATE TABLE IF NOT EXISTS contractor_payroll_sheets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL,
  branch_id     UUID,
  month         SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year          SMALLINT NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  status        VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
  submitted_by  UUID,
  submitted_at  TIMESTAMPTZ,
  reviewed_by   UUID,
  reviewed_at   TIMESTAMPTZ,
  review_note   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), month, year)
);

CREATE INDEX IF NOT EXISTS IDX_CPS_CLIENT_MONTH
  ON contractor_payroll_sheets (client_id, year, month);

-- 5. Per-employee wage calculation rows (snapshot at generation time)
CREATE TABLE IF NOT EXISTS contractor_payroll_sheet_rows (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id                UUID NOT NULL REFERENCES contractor_payroll_sheets(id) ON DELETE CASCADE,
  contractor_employee_id  UUID NOT NULL,
  employee_name           VARCHAR(250) NOT NULL,
  designation             VARCHAR(120),
  monthly_gross           NUMERIC(12,2) NOT NULL DEFAULT 0,
  basic_da_pct            SMALLINT NOT NULL DEFAULT 50,
  worked_days             NUMERIC(6,2) NOT NULL DEFAULT 0,
  daily_rate              NUMERIC(12,4) NOT NULL DEFAULT 0,
  earned_gross            NUMERIC(12,2) NOT NULL DEFAULT 0,
  pf_basis                NUMERIC(12,2) NOT NULL DEFAULT 0,
  pf_employee             NUMERIC(12,2) NOT NULL DEFAULT 0,
  pf_employer             NUMERIC(12,2) NOT NULL DEFAULT 0,
  esi_employee            NUMERIC(12,2) NOT NULL DEFAULT 0,
  esi_employer            NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_pay                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  ctc                     NUMERIC(12,2) NOT NULL DEFAULT 0,
  attendance_source       VARCHAR(10) NOT NULL DEFAULT 'UPLOAD'
                            CHECK (attendance_source IN ('UPLOAD','KIOSK','MIXED','NONE')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sheet_id, contractor_employee_id)
);
