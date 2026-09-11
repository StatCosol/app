-- ════════════════════════════════════════════════════════════════════════════
-- BCC for invoice email
-- ════════════════════════════════════════════════════════════════════════════
-- Invoices could already go to several addresses through cc_email, but CC
-- discloses every recipient to the others. An internal address that should
-- receive a client's invoice without the client seeing it had nowhere to go.
--
-- billing_clients.bcc_email    — applied to every invoice for that client,
--                                including the ones the recurring job sends
-- invoice_email_logs.bcc_email — so the log records what was actually sent,
--                                rather than only the visible recipients
--
-- Both are TEXT and comma-separated, matching cc_email: nodemailer accepts a
-- list, and the DTO validates them as strings rather than single addresses.
--
-- NOTE: nothing in this project runs backend/migrations automatically. The
-- matching boot patch in src/main.ts applies the same change on startup; this
-- file is the record of it and the path for a fresh database.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE billing_clients
  ADD COLUMN IF NOT EXISTS bcc_email TEXT;

ALTER TABLE invoice_email_logs
  ADD COLUMN IF NOT EXISTS bcc_email TEXT;
