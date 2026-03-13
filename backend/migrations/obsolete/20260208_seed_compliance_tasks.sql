-- ⚠️  DEPRECATED — DO NOT RUN. This inserts sample/demo compliance tasks.
-- All sample data was purged from the database. Use the Admin UI to create real data.
--
-- Original header:
-- Seed compliance tasks for Vedha Entech India Private Limited
-- Client: a31032bc-407e-4658-864b-a42bc1bff09e
-- CRM (assigned_by): e53df7cc-ea22-41ce-805c-6d79096d448a (chakravarthi)
-- Branches:
--   Hyderabad: 429f5d2f-3951-4712-ba38-22dc0c5ea305
--   Koduru:    96ebf37f-878a-4ce6-ac0b-6d1e95dda58d
-- Compliances:
--   1b4a2a73-fd2f-47f4-a2f5-4e2aa033fbaa  PF Monthly Compliance   MONTHLY
--   7603cc47-5ccd-440b-8947-e3de13d7a64f  ESI Monthly Compliance  MONTHLY
--   5438513f-0c92-43f3-b9a0-34462ab7750b  Professional Tax        MONTHLY
--   4a68e184-65e3-4dd1-8baa-a702f5d7bcfa  Factory Registers       MONTHLY
--   8b053565-bc65-4ffe-a83c-d9171d5bd506  Annual Return           YEARLY

BEGIN;

-- ===== Populate branches table to satisfy FK on compliance_tasks =====
-- branch IDs match client_branches so both tables stay in sync
INSERT INTO branches (id, client_id, branch_code, branch_name, branch_type, state, state_code, headcount)
VALUES
  ('429f5d2f-3951-4712-ba38-22dc0c5ea305', 'a31032bc-407e-4658-864b-a42bc1bff09e', 'HYD-001', 'Hyderabad', 'ESTABLISHMENT', 'Telangana', 'TS', 50),
  ('96ebf37f-878a-4ce6-ac0b-6d1e95dda58d', 'a31032bc-407e-4658-864b-a42bc1bff09e', 'KDR-001', 'Koduru', 'FACTORY', 'Andhra Pradesh', 'AP', 30)
ON CONFLICT (id) DO NOTHING;

-- ===== Hyderabad Branch: Oct 2025 – Feb 2026 =====

-- Oct 2025 — all approved (past)
INSERT INTO compliance_tasks (client_id, branch_id, compliance_id, title, frequency, period_year, period_month, due_date, status, assigned_by_user_id)
VALUES
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '1b4a2a73-fd2f-47f4-a2f5-4e2aa033fbaa', 'PF Monthly Compliance', 'MONTHLY', 2025, 10, '2025-10-15', 'APPROVED', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '7603cc47-5ccd-440b-8947-e3de13d7a64f', 'ESI Monthly Compliance', 'MONTHLY', 2025, 10, '2025-10-15', 'APPROVED', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '5438513f-0c92-43f3-b9a0-34462ab7750b', 'Professional Tax', 'MONTHLY', 2025, 10, '2025-10-15', 'APPROVED', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '4a68e184-65e3-4dd1-8baa-a702f5d7bcfa', 'Factory Registers', 'MONTHLY', 2025, 10, '2025-10-15', 'APPROVED', 'e53df7cc-ea22-41ce-805c-6d79096d448a');

-- Nov 2025 — mix of approved + submitted
INSERT INTO compliance_tasks (client_id, branch_id, compliance_id, title, frequency, period_year, period_month, due_date, status, assigned_by_user_id)
VALUES
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '1b4a2a73-fd2f-47f4-a2f5-4e2aa033fbaa', 'PF Monthly Compliance', 'MONTHLY', 2025, 11, '2025-11-15', 'APPROVED', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '7603cc47-5ccd-440b-8947-e3de13d7a64f', 'ESI Monthly Compliance', 'MONTHLY', 2025, 11, '2025-11-15', 'APPROVED', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '5438513f-0c92-43f3-b9a0-34462ab7750b', 'Professional Tax', 'MONTHLY', 2025, 11, '2025-11-15', 'SUBMITTED', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '4a68e184-65e3-4dd1-8baa-a702f5d7bcfa', 'Factory Registers', 'MONTHLY', 2025, 11, '2025-11-15', 'APPROVED', 'e53df7cc-ea22-41ce-805c-6d79096d448a');

-- Dec 2025 — mix: approved, overdue, submitted
INSERT INTO compliance_tasks (client_id, branch_id, compliance_id, title, frequency, period_year, period_month, due_date, status, assigned_by_user_id)
VALUES
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '1b4a2a73-fd2f-47f4-a2f5-4e2aa033fbaa', 'PF Monthly Compliance', 'MONTHLY', 2025, 12, '2025-12-15', 'APPROVED', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '7603cc47-5ccd-440b-8947-e3de13d7a64f', 'ESI Monthly Compliance', 'MONTHLY', 2025, 12, '2025-12-15', 'OVERDUE', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '5438513f-0c92-43f3-b9a0-34462ab7750b', 'Professional Tax', 'MONTHLY', 2025, 12, '2025-12-15', 'SUBMITTED', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '4a68e184-65e3-4dd1-8baa-a702f5d7bcfa', 'Factory Registers', 'MONTHLY', 2025, 12, '2025-12-15', 'APPROVED', 'e53df7cc-ea22-41ce-805c-6d79096d448a');

-- Jan 2026 — mix: pending, in_progress, submitted, overdue
INSERT INTO compliance_tasks (client_id, branch_id, compliance_id, title, frequency, period_year, period_month, due_date, status, assigned_by_user_id)
VALUES
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '1b4a2a73-fd2f-47f4-a2f5-4e2aa033fbaa', 'PF Monthly Compliance', 'MONTHLY', 2026, 1, '2026-01-15', 'SUBMITTED', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '7603cc47-5ccd-440b-8947-e3de13d7a64f', 'ESI Monthly Compliance', 'MONTHLY', 2026, 1, '2026-01-15', 'OVERDUE', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '5438513f-0c92-43f3-b9a0-34462ab7750b', 'Professional Tax', 'MONTHLY', 2026, 1, '2026-01-15', 'IN_PROGRESS', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '4a68e184-65e3-4dd1-8baa-a702f5d7bcfa', 'Factory Registers', 'MONTHLY', 2026, 1, '2026-01-15', 'PENDING', 'e53df7cc-ea22-41ce-805c-6d79096d448a');

-- Feb 2026 — current month: pending & in_progress
INSERT INTO compliance_tasks (client_id, branch_id, compliance_id, title, frequency, period_year, period_month, due_date, status, assigned_by_user_id)
VALUES
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '1b4a2a73-fd2f-47f4-a2f5-4e2aa033fbaa', 'PF Monthly Compliance', 'MONTHLY', 2026, 2, '2026-02-15', 'PENDING', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '7603cc47-5ccd-440b-8947-e3de13d7a64f', 'ESI Monthly Compliance', 'MONTHLY', 2026, 2, '2026-02-15', 'PENDING', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '5438513f-0c92-43f3-b9a0-34462ab7750b', 'Professional Tax', 'MONTHLY', 2026, 2, '2026-02-15', 'IN_PROGRESS', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '4a68e184-65e3-4dd1-8baa-a702f5d7bcfa', 'Factory Registers', 'MONTHLY', 2026, 2, '2026-02-15', 'PENDING', 'e53df7cc-ea22-41ce-805c-6d79096d448a');

-- Annual Return for Hyderabad (2025)
INSERT INTO compliance_tasks (client_id, branch_id, compliance_id, title, frequency, period_year, period_month, due_date, status, assigned_by_user_id)
VALUES
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '429f5d2f-3951-4712-ba38-22dc0c5ea305', '8b053565-bc65-4ffe-a83c-d9171d5bd506', 'Annual Return', 'YEARLY', 2025, NULL, '2026-01-31', 'SUBMITTED', 'e53df7cc-ea22-41ce-805c-6d79096d448a');


-- ===== Koduru Branch: Nov 2025 – Feb 2026 =====

-- Nov 2025
INSERT INTO compliance_tasks (client_id, branch_id, compliance_id, title, frequency, period_year, period_month, due_date, status, assigned_by_user_id)
VALUES
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '96ebf37f-878a-4ce6-ac0b-6d1e95dda58d', '1b4a2a73-fd2f-47f4-a2f5-4e2aa033fbaa', 'PF Monthly Compliance', 'MONTHLY', 2025, 11, '2025-11-15', 'APPROVED', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '96ebf37f-878a-4ce6-ac0b-6d1e95dda58d', '4a68e184-65e3-4dd1-8baa-a702f5d7bcfa', 'Factory Registers', 'MONTHLY', 2025, 11, '2025-11-15', 'APPROVED', 'e53df7cc-ea22-41ce-805c-6d79096d448a');

-- Dec 2025
INSERT INTO compliance_tasks (client_id, branch_id, compliance_id, title, frequency, period_year, period_month, due_date, status, assigned_by_user_id)
VALUES
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '96ebf37f-878a-4ce6-ac0b-6d1e95dda58d', '1b4a2a73-fd2f-47f4-a2f5-4e2aa033fbaa', 'PF Monthly Compliance', 'MONTHLY', 2025, 12, '2025-12-15', 'APPROVED', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '96ebf37f-878a-4ce6-ac0b-6d1e95dda58d', '4a68e184-65e3-4dd1-8baa-a702f5d7bcfa', 'Factory Registers', 'MONTHLY', 2025, 12, '2025-12-15', 'OVERDUE', 'e53df7cc-ea22-41ce-805c-6d79096d448a');

-- Jan 2026
INSERT INTO compliance_tasks (client_id, branch_id, compliance_id, title, frequency, period_year, period_month, due_date, status, assigned_by_user_id)
VALUES
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '96ebf37f-878a-4ce6-ac0b-6d1e95dda58d', '1b4a2a73-fd2f-47f4-a2f5-4e2aa033fbaa', 'PF Monthly Compliance', 'MONTHLY', 2026, 1, '2026-01-15', 'PENDING', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '96ebf37f-878a-4ce6-ac0b-6d1e95dda58d', '4a68e184-65e3-4dd1-8baa-a702f5d7bcfa', 'Factory Registers', 'MONTHLY', 2026, 1, '2026-01-15', 'OVERDUE', 'e53df7cc-ea22-41ce-805c-6d79096d448a');

-- Feb 2026
INSERT INTO compliance_tasks (client_id, branch_id, compliance_id, title, frequency, period_year, period_month, due_date, status, assigned_by_user_id)
VALUES
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '96ebf37f-878a-4ce6-ac0b-6d1e95dda58d', '1b4a2a73-fd2f-47f4-a2f5-4e2aa033fbaa', 'PF Monthly Compliance', 'MONTHLY', 2026, 2, '2026-02-15', 'PENDING', 'e53df7cc-ea22-41ce-805c-6d79096d448a'),
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '96ebf37f-878a-4ce6-ac0b-6d1e95dda58d', '4a68e184-65e3-4dd1-8baa-a702f5d7bcfa', 'Factory Registers', 'MONTHLY', 2026, 2, '2026-02-15', 'IN_PROGRESS', 'e53df7cc-ea22-41ce-805c-6d79096d448a');

-- Annual Return for Koduru (2025)
INSERT INTO compliance_tasks (client_id, branch_id, compliance_id, title, frequency, period_year, period_month, due_date, status, assigned_by_user_id)
VALUES
  ('a31032bc-407e-4658-864b-a42bc1bff09e', '96ebf37f-878a-4ce6-ac0b-6d1e95dda58d', '8b053565-bc65-4ffe-a83c-d9171d5bd506', 'Annual Return', 'YEARLY', 2025, NULL, '2026-01-31', 'OVERDUE', 'e53df7cc-ea22-41ce-805c-6d79096d448a');

COMMIT;
