-- One-time: stop boot-time main.ts from resetting identification_mode (fixed in main.ts).
-- Re-apply FACE_ONLY for clients that chose it in the portal but were forced back to PIN_THEN_FACE
-- on every backend restart by the removed UPDATE in main.ts.

-- Example (replace client_id):
-- UPDATE facedesk_face_settings
--   SET identification_mode = 'FACE_ONLY'
-- WHERE client_id = '<your-client-uuid>';
