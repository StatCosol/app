-- Reviewed state register bindings; never infer coverage from DEFAULT_INDIA.
INSERT INTO unit_compliance_master (code,name,category,state_code,frequency,applies_to,is_active)
VALUES
('AP_SHOPS_1988','Andhra Pradesh Shops Act — reviewed register applicability','STATE_LABOUR_ACT','AP','ON_DEMAND','BOTH',true),
('KA_SHOPS_1961','Karnataka Shops Act — reviewed register applicability','STATE_LABOUR_ACT','KA','ON_DEMAND','BOTH',true),
('TN_SHOPS_1947','Tamil Nadu Shops Act — reviewed register applicability','STATE_LABOUR_ACT','TN','ON_DEMAND','BOTH',true),
('HR_SHOPS_1958','Haryana Shops Act — reviewed register applicability','STATE_LABOUR_ACT','HR','ON_DEMAND','BOTH',true),
('WB_SHOPS_1963','West Bengal Shops Act — reviewed register applicability','STATE_LABOUR_ACT','WB','ON_DEMAND','BOTH',true)
ON CONFLICT (code) DO NOTHING;
INSERT INTO package_compliance (package_id,compliance_id,included_by_default)
SELECT p.id,c.id,false FROM compliance_package p CROSS JOIN unit_compliance_master c
WHERE p.code='DEFAULT_INDIA' AND c.code IN ('AP_SHOPS_1988','KA_SHOPS_1961','TN_SHOPS_1947','HR_SHOPS_1958','WB_SHOPS_1963')
ON CONFLICT (package_id,compliance_id) DO UPDATE SET included_by_default=false;
