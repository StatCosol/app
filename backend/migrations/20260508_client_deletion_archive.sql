-- ============================================================================
-- 20260508_client_deletion_archive.sql
-- Snapshot table that preserves a deleted client's registers, payroll runs,
-- audit reports and contractor details (deployment / termination dates,
-- non-compliance points) for 1.5 years (548 days) after client deletion.
--
-- Populated by ClientsService.softDelete() at the moment of deletion.
-- Purged by ClientArchivePurgeCronService after `purge_after` elapses.
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_deletion_archive (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identification of the deleted client (kept verbatim because the row
  -- in `clients` may itself be hard-purged at the 3-year retention mark).
  client_id               uuid NOT NULL,
  client_code             varchar(50),
  client_name             varchar(255),

  -- Lifecycle
  archived_at             timestamptz NOT NULL DEFAULT NOW(),
  purge_after             timestamptz NOT NULL,           -- = archived_at + 18 months
  archived_by             uuid,                            -- user who deleted the client
  delete_reason           text,
  purged                  boolean NOT NULL DEFAULT false,
  purged_at               timestamptz,

  -- Snapshots (JSONB so the schema can evolve without re-migrating archives)
  registers_snapshot      jsonb NOT NULL DEFAULT '[]'::jsonb,
  payroll_snapshot        jsonb NOT NULL DEFAULT '{}'::jsonb,
  audit_reports_snapshot  jsonb NOT NULL DEFAULT '[]'::jsonb,
  contractors_snapshot    jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Free-form metadata (counts, source versions, etc.)
  meta                    jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cda_client          ON client_deletion_archive(client_id);
CREATE INDEX IF NOT EXISTS idx_cda_purge_after     ON client_deletion_archive(purge_after) WHERE purged = false;
CREATE INDEX IF NOT EXISTS idx_cda_archived_at     ON client_deletion_archive(archived_at);

COMMENT ON TABLE client_deletion_archive IS
  '18-month retention snapshot of registers, payroll, audit reports and '
  'contractor deployment / termination / NC data for deleted clients.';
