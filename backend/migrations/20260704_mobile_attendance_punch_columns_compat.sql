-- Backfill current punch columns on legacy databases where the punch tables
-- already existed before the current mobile attendance entities were added.
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
      ADD COLUMN IF NOT EXISTS gallery_size INTEGER,
      ADD COLUMN IF NOT EXISTS liveness_score NUMERIC,
      ADD COLUMN IF NOT EXISTS liveness_challenge_type VARCHAR(30),
      ADD COLUMN IF NOT EXISTS liveness_challenge_passed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS liveness_nonce VARCHAR(100),
      ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(40),
      ADD COLUMN IF NOT EXISTS photo_url TEXT,
      ADD COLUMN IF NOT EXISTS capture_lat NUMERIC,
      ADD COLUMN IF NOT EXISTS capture_lng NUMERIC,
      ADD COLUMN IF NOT EXISTS ip VARCHAR(45),
      ADD COLUMN IF NOT EXISTS user_agent TEXT,
      ADD COLUMN IF NOT EXISTS is_mock_location BOOLEAN,
      ADD COLUMN IF NOT EXISTS is_rooted BOOLEAN,
      ADD COLUMN IF NOT EXISTS offline_sync BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
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
      ADD COLUMN IF NOT EXISTS gallery_size INTEGER,
      ADD COLUMN IF NOT EXISTS liveness_score NUMERIC,
      ADD COLUMN IF NOT EXISTS liveness_challenge_type VARCHAR(30),
      ADD COLUMN IF NOT EXISTS liveness_challenge_passed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS liveness_nonce VARCHAR(100),
      ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(40),
      ADD COLUMN IF NOT EXISTS photo_url TEXT,
      ADD COLUMN IF NOT EXISTS capture_lat NUMERIC,
      ADD COLUMN IF NOT EXISTS capture_lng NUMERIC,
      ADD COLUMN IF NOT EXISTS ip VARCHAR(45),
      ADD COLUMN IF NOT EXISTS user_agent TEXT,
      ADD COLUMN IF NOT EXISTS is_mock_location BOOLEAN,
      ADD COLUMN IF NOT EXISTS is_rooted BOOLEAN,
      ADD COLUMN IF NOT EXISTS offline_sync BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
  IF to_regclass('public.mobile_attendance_punches') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_mobile_attendance_punches_device_id
      ON public.mobile_attendance_punches(device_id);
  END IF;

  IF to_regclass('public.contractor_biometric_punches') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_contractor_biometric_punches_device_id
      ON public.contractor_biometric_punches(device_id);
  END IF;
END $$;
