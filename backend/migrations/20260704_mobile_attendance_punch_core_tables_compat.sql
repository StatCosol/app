-- Compatibility repair for databases where the original mobile attendance v2
-- migration was tracked before the punch tables existed.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.mobile_attendance_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  branch_id UUID,
  device_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  direction VARCHAR(5) NOT NULL CHECK (direction IN ('IN','OUT','AUTO')),
  punch_time TIMESTAMPTZ NOT NULL,
  match_score NUMERIC,
  match_cosine NUMERIC,
  match_threshold NUMERIC,
  match_margin NUMERIC,
  match_margin_threshold NUMERIC,
  second_best_subject_type VARCHAR(20),
  second_best_subject_id UUID,
  second_best_cosine NUMERIC,
  gallery_size INTEGER,
  liveness_score NUMERIC,
  liveness_challenge_type VARCHAR(30),
  liveness_challenge_passed_at TIMESTAMPTZ,
  liveness_nonce VARCHAR(100),
  embedding_model VARCHAR(40),
  photo_url TEXT,
  capture_lat NUMERIC,
  capture_lng NUMERIC,
  ip VARCHAR(45),
  user_agent TEXT,
  is_mock_location BOOLEAN,
  is_rooted BOOLEAN,
  offline_sync BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mobile_attendance_punches
  ADD COLUMN IF NOT EXISTS match_cosine NUMERIC,
  ADD COLUMN IF NOT EXISTS match_threshold NUMERIC,
  ADD COLUMN IF NOT EXISTS match_margin NUMERIC,
  ADD COLUMN IF NOT EXISTS match_margin_threshold NUMERIC,
  ADD COLUMN IF NOT EXISTS second_best_subject_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS second_best_subject_id UUID,
  ADD COLUMN IF NOT EXISTS second_best_cosine NUMERIC,
  ADD COLUMN IF NOT EXISTS gallery_size INTEGER;

CREATE INDEX IF NOT EXISTS idx_map_client_employee
  ON public.mobile_attendance_punches(client_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_map_punch_time
  ON public.mobile_attendance_punches(punch_time);
CREATE INDEX IF NOT EXISTS idx_mobile_attendance_punches_device_id
  ON public.mobile_attendance_punches(device_id);

CREATE TABLE IF NOT EXISTS public.contractor_biometric_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  branch_id UUID,
  device_id UUID NOT NULL,
  contractor_employee_id UUID NOT NULL,
  direction VARCHAR(5) NOT NULL CHECK (direction IN ('IN','OUT','AUTO')),
  punch_time TIMESTAMPTZ NOT NULL,
  match_score NUMERIC,
  match_cosine NUMERIC,
  match_threshold NUMERIC,
  match_margin NUMERIC,
  match_margin_threshold NUMERIC,
  second_best_subject_type VARCHAR(20),
  second_best_subject_id UUID,
  second_best_cosine NUMERIC,
  gallery_size INTEGER,
  liveness_score NUMERIC,
  liveness_challenge_type VARCHAR(30),
  liveness_challenge_passed_at TIMESTAMPTZ,
  liveness_nonce VARCHAR(100),
  embedding_model VARCHAR(40),
  photo_url TEXT,
  capture_lat NUMERIC,
  capture_lng NUMERIC,
  ip VARCHAR(45),
  user_agent TEXT,
  is_mock_location BOOLEAN,
  is_rooted BOOLEAN,
  offline_sync BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contractor_biometric_punches
  ADD COLUMN IF NOT EXISTS match_cosine NUMERIC,
  ADD COLUMN IF NOT EXISTS match_threshold NUMERIC,
  ADD COLUMN IF NOT EXISTS match_margin NUMERIC,
  ADD COLUMN IF NOT EXISTS match_margin_threshold NUMERIC,
  ADD COLUMN IF NOT EXISTS second_best_subject_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS second_best_subject_id UUID,
  ADD COLUMN IF NOT EXISTS second_best_cosine NUMERIC,
  ADD COLUMN IF NOT EXISTS gallery_size INTEGER;

CREATE INDEX IF NOT EXISTS idx_cbp_client_ce
  ON public.contractor_biometric_punches(client_id, contractor_employee_id);
CREATE INDEX IF NOT EXISTS idx_contractor_biometric_punches_device_id
  ON public.contractor_biometric_punches(device_id);
