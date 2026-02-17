-- Ad-hoc seed for compliance_returns to populate the compliance-status /returns endpoint
-- Client: a31032bc-407e-4658-864b-a42bc1bff09e (from CLIENT token)
-- Branches: Hyderabad (429f5d2f-3951-4712-ba38-22dc0c5ea305), Koduru (96ebf37f-878a-4ce6-ac0b-6d1e95dda58d)
-- Period: Feb 2026 (month=2, year=2026)

BEGIN;

DELETE FROM compliance_returns
WHERE client_id = 'a31032bc-407e-4658-864b-a42bc1bff09e'
  AND period_year = 2026
  AND period_month = 2;

INSERT INTO compliance_returns (
  client_id,
  branch_id,
  law_type,
  return_type,
  period_year,
  period_month,
  period_label,
  due_date,
  filed_date,
  status,
  is_deleted,
  created_at,
  updated_at
) VALUES
  -- Hyderabad: overdue PF return (no filed_date -> will show OVERDUE)
  ('a31032bc-407e-4658-864b-a42bc1bff09e',
   '429f5d2f-3951-4712-ba38-22dc0c5ea305',
   'PF',
   'PF Monthly Return',
   2026,
   2,
   'Feb-2026',
   '2026-02-10',
   NULL,
   'PENDING',
   false,
   NOW(),
   NOW()),
  -- Hyderabad: filed ESI return (shows FILED)
  ('a31032bc-407e-4658-864b-a42bc1bff09e',
   '429f5d2f-3951-4712-ba38-22dc0c5ea305',
   'ESI',
   'ESI Monthly Return',
   2026,
   2,
   'Feb-2026',
   '2026-02-12',
   '2026-02-15',
   'APPROVED',
   false,
   NOW(),
   NOW()),
  -- Koduru: due soon PT return (no filed_date, due within a week of today)
  ('a31032bc-407e-4658-864b-a42bc1bff09e',
   '96ebf37f-878a-4ce6-ac0b-6d1e95dda58d',
   'PT',
   'Professional Tax Return',
   2026,
   2,
   'Feb-2026',
   '2026-02-24',
   NULL,
   'PENDING',
   false,
   NOW(),
   NOW());

COMMIT;
