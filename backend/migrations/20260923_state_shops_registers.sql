-- Separate state Acts. Never infer their applicability from a Labour Code.
-- Existing applicability overrides require a reason and recomputation. No ENABLE rule.
INSERT INTO unit_compliance_master (code,name,category,state_code,frequency,applies_to,is_active)
VALUES ('TS_SHOPS_1988','Telangana Shops and Establishments Act, 1988 — register applicability','STATE_LABOUR_ACT','TS','ON_DEMAND','BOTH',true),
('SHOPS_2017','Maharashtra Shops and Establishments Act, 2017 — register applicability','STATE_LABOUR_ACT','MH','ON_DEMAND','BOTH',true)
ON CONFLICT (code) DO NOTHING;
INSERT INTO package_compliance (package_id,compliance_id)
SELECT p.id,c.id FROM compliance_package p CROSS JOIN unit_compliance_master c
WHERE p.code='DEFAULT_INDIA' AND c.code IN ('TS_SHOPS_1988','SHOPS_2017')
ON CONFLICT DO NOTHING;
