-- Seed the DEFAULT_INDIA compliance package (required by units/recompute)
INSERT INTO compliance_package (code, name, applies_to)
VALUES ('DEFAULT_INDIA', 'Default India Compliance Package', 'BOTH')
ON CONFLICT (code) DO NOTHING;

-- Link ALL active compliance masters to the default package
INSERT INTO package_compliance (package_id, compliance_id)
SELECT
  (SELECT id FROM compliance_package WHERE code = 'DEFAULT_INDIA'),
  id
FROM unit_compliance_master
WHERE is_active = true
ON CONFLICT DO NOTHING;

-- Link ALL active rules to the default package
INSERT INTO package_rule (package_id, rule_id)
SELECT
  (SELECT id FROM compliance_package WHERE code = 'DEFAULT_INDIA'),
  id
FROM applicability_rule
WHERE is_active = true
ON CONFLICT DO NOTHING;
