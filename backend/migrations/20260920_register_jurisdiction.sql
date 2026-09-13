-- Keep unknown jurisdiction explicit. Apply before deploying the entity reader.
ALTER TABLE unit_facts
  ADD COLUMN IF NOT EXISTS appropriate_government varchar(10);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='unit_facts_register_government_check' AND conrelid='unit_facts'::regclass) THEN
    ALTER TABLE unit_facts ADD CONSTRAINT unit_facts_register_government_check
      CHECK (appropriate_government IS NULL OR appropriate_government IN ('CENTRAL','STATE'));
  END IF;
END $$;

-- A distinct Code identity, not a synonym for the repealed wage Acts.
-- No automatic ENABLE rule: staff confirm applicability using the existing
-- branch override workflow and its reason/audit trail.
INSERT INTO unit_compliance_master (code,name,category,state_code,frequency,applies_to,is_active)
VALUES ('WAGES_2019','Code on Wages, 2019 — register applicability','LABOUR_CODE',NULL,'ON_DEMAND','BOTH',true),
('OSH_2020','Occupational Safety, Health and Working Conditions Code, 2020 — register applicability','LABOUR_CODE',NULL,'ON_DEMAND','BOTH',true)
ON CONFLICT (code) DO NOTHING;
INSERT INTO package_compliance (package_id,compliance_id)
SELECT p.id,c.id FROM compliance_package p CROSS JOIN unit_compliance_master c
WHERE p.code='DEFAULT_INDIA' AND c.code IN ('WAGES_2019','OSH_2020')
ON CONFLICT DO NOTHING;
