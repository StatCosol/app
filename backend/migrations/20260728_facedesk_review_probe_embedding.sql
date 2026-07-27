-- Point 4 (adaptive gallery): keep the flagged punch's face embedding on the
-- review item so that on HR approval it can be added to the subject's face
-- gallery — a later punch at the same angle then matches automatically.
-- Mirrored by the boot-time schema patch in backend/src/main.ts.

ALTER TABLE facedesk_attendance_review_queue
  ADD COLUMN IF NOT EXISTS probe_embedding bytea;
