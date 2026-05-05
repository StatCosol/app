-- Backfill invoice_email_logs for pending-payment reminders that were
-- sent before the email-log mirroring was deployed.
INSERT INTO invoice_email_logs (
  id, invoice_id, pending_payment_id, source,
  to_email, cc_email, subject, body,
  sent_status, sent_at, sent_by, failure_reason, created_at
)
SELECT
  gen_random_uuid(),
  NULL,
  pp.id,
  'PENDING_PAYMENT',
  pp.client_email,
  pp.cc_email,
  'Payment Reminder — Invoice ' || pp.invoice_number,
  'Payment reminder for invoice ' || pp.invoice_number
    || COALESCE(' — ₹ ' || to_char(pp.amount, 'FM999,999,990.00'), ''),
  CASE WHEN pp.last_reminder_status = 'SENT' THEN 'SENT'
       ELSE 'FAILED' END,
  pp.last_reminder_sent_at,
  pp.uploaded_by,
  pp.last_failure_reason,
  pp.last_reminder_sent_at
FROM pending_payment_followups pp
WHERE pp.last_reminder_sent_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM invoice_email_logs l
    WHERE l.pending_payment_id = pp.id
  );
