-- Every password-write path invalidates sessions in the same transaction.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION invalidate_password_sessions() RETURNS trigger AS $$
BEGIN
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
    NEW.session_version := OLD.session_version + 1;
    UPDATE refresh_tokens SET revoked_at = clock_timestamp()
      WHERE user_id = NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS users_password_sessions ON users;
CREATE TRIGGER users_password_sessions BEFORE UPDATE OF password_hash ON users
FOR EACH ROW EXECUTE FUNCTION invalidate_password_sessions();

CREATE TABLE IF NOT EXISTS sales_lead_counters (year integer PRIMARY KEY, last_value bigint NOT NULL);
INSERT INTO sales_lead_counters(year, last_value)
SELECT split_part(lead_no, '-', 2)::integer, max(split_part(lead_no, '-', 3)::bigint)
FROM leads WHERE lead_no ~ '^LEAD-[0-9]{4}-[0-9]+$'
GROUP BY split_part(lead_no, '-', 2)::integer
ON CONFLICT (year) DO UPDATE SET last_value = greatest(sales_lead_counters.last_value, EXCLUDED.last_value);
