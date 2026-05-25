-- Roadmap #14: aging / appearance-change handling.
--
-- A nightly cron computes rolling-window AVG(match_score) per active
-- enrollment. When the score trends below the configured threshold we
-- flag the enrollment + raise a notification asking the admin to
-- request a re-enrollment. The columns below let us
--   (a) dedupe alerts (only re-alert if avg drops further or after a
--       30-day cool-off), and
--   (b) expose the flag to the admin UI so it can show a banner on the
--       employee record.

ALTER TABLE face_enrollments
  ADD COLUMN IF NOT EXISTS appearance_drift_flagged_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS appearance_drift_avg_score numeric NULL,
  ADD COLUMN IF NOT EXISTS appearance_drift_sample_count integer NULL;

ALTER TABLE contractor_face_enrollments
  ADD COLUMN IF NOT EXISTS appearance_drift_flagged_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS appearance_drift_avg_score numeric NULL,
  ADD COLUMN IF NOT EXISTS appearance_drift_sample_count integer NULL;

CREATE INDEX IF NOT EXISTS ix_face_enrollments_drift_flagged
  ON face_enrollments (client_id, appearance_drift_flagged_at)
  WHERE appearance_drift_flagged_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_contractor_face_enrollments_drift_flagged
  ON contractor_face_enrollments (client_id, appearance_drift_flagged_at)
  WHERE appearance_drift_flagged_at IS NOT NULL;
