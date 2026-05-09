-- Migration: Add geolocation and capture method columns to attendance_records
-- Date: 2026-03-22
-- Purpose: Support employee self check-in/check-out with geolocation, biometric, face capture

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS capture_method VARCHAR(20) DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS device_info VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS check_in_lat NUMERIC(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS check_in_lng NUMERIC(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS check_out_lat NUMERIC(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS check_out_lng NUMERIC(10, 7) NULL,
  ADD COLUMN IF NOT EXISTS self_marked BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN attendance_records.capture_method IS 'MANUAL | BIOMETRIC | FACE | GEOLOCATION';
COMMENT ON COLUMN attendance_records.latitude IS 'Primary geolocation latitude (deprecated, use check_in_lat/check_out_lat)';
COMMENT ON COLUMN attendance_records.longitude IS 'Primary geolocation longitude (deprecated, use check_in_lng/check_out_lng)';
COMMENT ON COLUMN attendance_records.device_info IS 'User-agent or device identifier';
COMMENT ON COLUMN attendance_records.check_in_lat IS 'Latitude captured at check-in';
COMMENT ON COLUMN attendance_records.check_in_lng IS 'Longitude captured at check-in';
COMMENT ON COLUMN attendance_records.check_out_lat IS 'Latitude captured at check-out';
COMMENT ON COLUMN attendance_records.check_out_lng IS 'Longitude captured at check-out';
COMMENT ON COLUMN attendance_records.self_marked IS 'True if employee self-marked via ESS portal';
