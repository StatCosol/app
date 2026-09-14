-- Exact legal identity used by the preparable Social Security register forms.
-- Additive migration also repairs installations that already ran the earlier seeds.
INSERT INTO unit_compliance_master (code,name,category,state_code,frequency,applies_to,is_active)
VALUES ('SOCIAL_SECURITY_2020','Code on Social Security, 2020 — register applicability','LABOUR_CODE',NULL,'ON_DEMAND','BOTH',true)
ON CONFLICT (code) DO NOTHING;

-- Show the identity in recomputation/override results, but require reviewed
-- applicability instead of automatically enabling it for every establishment.
INSERT INTO package_compliance (package_id,compliance_id,included_by_default)
SELECT p.id,c.id,false FROM compliance_package p CROSS JOIN unit_compliance_master c
WHERE p.code='DEFAULT_INDIA' AND c.code='SOCIAL_SECURITY_2020'
ON CONFLICT DO NOTHING;
