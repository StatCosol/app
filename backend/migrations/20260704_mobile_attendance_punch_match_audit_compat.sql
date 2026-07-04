-- Store enough match evidence on accepted punches to support disputes and
-- empirical threshold tuning per client/site.
DO $$
BEGIN
  IF to_regclass('public.mobile_attendance_punches') IS NOT NULL THEN
    ALTER TABLE public.mobile_attendance_punches
      ADD COLUMN IF NOT EXISTS match_cosine NUMERIC,
      ADD COLUMN IF NOT EXISTS match_threshold NUMERIC,
      ADD COLUMN IF NOT EXISTS match_margin NUMERIC,
      ADD COLUMN IF NOT EXISTS match_margin_threshold NUMERIC,
      ADD COLUMN IF NOT EXISTS second_best_subject_type VARCHAR(20),
      ADD COLUMN IF NOT EXISTS second_best_subject_id UUID,
      ADD COLUMN IF NOT EXISTS second_best_cosine NUMERIC,
      ADD COLUMN IF NOT EXISTS gallery_size INTEGER;
  END IF;

  IF to_regclass('public.contractor_biometric_punches') IS NOT NULL THEN
    ALTER TABLE public.contractor_biometric_punches
      ADD COLUMN IF NOT EXISTS match_cosine NUMERIC,
      ADD COLUMN IF NOT EXISTS match_threshold NUMERIC,
      ADD COLUMN IF NOT EXISTS match_margin NUMERIC,
      ADD COLUMN IF NOT EXISTS match_margin_threshold NUMERIC,
      ADD COLUMN IF NOT EXISTS second_best_subject_type VARCHAR(20),
      ADD COLUMN IF NOT EXISTS second_best_subject_id UUID,
      ADD COLUMN IF NOT EXISTS second_best_cosine NUMERIC,
      ADD COLUMN IF NOT EXISTS gallery_size INTEGER;
  END IF;
END $$;
