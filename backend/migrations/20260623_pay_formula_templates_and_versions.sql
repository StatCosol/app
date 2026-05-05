-- Phase 2A: reusable formula templates + structure version snapshots.
--
-- pay_formula_templates  - named formula trees, reusable across structures.
--                          Scope: GLOBAL (no client) or CLIENT-scoped.
-- pay_salary_structure_versions - JSONB snapshot of all items each time
--                          a structure is materially edited. Lets us audit,
--                          diff, and (later) restore prior states.

CREATE TABLE IF NOT EXISTS pay_formula_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NULL,
  name            varchar(180) NOT NULL,
  description     text NULL,
  component_id    uuid NULL,
  formula_json    jsonb NOT NULL,
  formula_text    text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_by_id   uuid NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pay_formula_templates_client
  ON pay_formula_templates(client_id);
CREATE INDEX IF NOT EXISTS idx_pay_formula_templates_component
  ON pay_formula_templates(component_id);

CREATE TABLE IF NOT EXISTS pay_salary_structure_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id    uuid NOT NULL,
  version_no      int  NOT NULL,
  items_snapshot  jsonb NOT NULL,
  reason          varchar(80) NULL,
  changed_by_id   uuid NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pay_struct_version UNIQUE (structure_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_pay_struct_versions_struct
  ON pay_salary_structure_versions(structure_id, version_no DESC);

COMMENT ON TABLE pay_formula_templates IS
  'Reusable formula trees authored in the Visual Formula Builder. Selecting a template loads its formula_json into a structure item.';
COMMENT ON TABLE pay_salary_structure_versions IS
  'Append-only JSONB snapshots of pay_salary_structure_items captured each time a structure is materially edited.';
