-- Adds ACCOUNTS role for the accounts-billing module (invoices, payments, GST reports).
INSERT INTO roles (code, name, is_system)
VALUES ('ACCOUNTS', 'Accounts / Billing', true)
ON CONFLICT (code) DO NOTHING;
