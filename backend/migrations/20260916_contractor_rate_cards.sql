ALTER TABLE contractor_quotation_wages ADD COLUMN IF NOT EXISTS designation varchar(120) NOT NULL DEFAULT '';
ALTER TABLE contractor_quotation_wages ADD COLUMN IF NOT EXISTS rate_card jsonb;
ALTER TABLE contractor_mcd_computations ADD COLUMN IF NOT EXISTS calculation_snapshot jsonb;
DROP INDEX IF EXISTS uq_contractor_quotation_wages_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contractor_quotation_wages_designation_key ON contractor_quotation_wages
(client_id,contractor_user_id,COALESCE(branch_id,'00000000-0000-0000-0000-000000000000'::uuid),skill_category,designation,effective_from);

ALTER TABLE contractor_mcd_computations ADD COLUMN IF NOT EXISTS total_earnings numeric(12,2);

ALTER TABLE contractor_attendance_batches ADD COLUMN IF NOT EXISTS approved_rows_snapshot jsonb;
