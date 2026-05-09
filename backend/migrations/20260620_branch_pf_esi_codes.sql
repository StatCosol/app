-- Branch-wise PF / ESI establishment codes
-- Purpose: Some clients have separate PF / ESI registrations per branch.
-- When set, contribution files (ECR, ESI) must be generated per branch
-- with the corresponding establishment code in the file header / metadata.
--
-- Both columns are nullable. When NULL, the client-level code (if any)
-- and consolidated single-file generation continue to be used.

ALTER TABLE client_branches
  ADD COLUMN IF NOT EXISTS pf_code  varchar(40),
  ADD COLUMN IF NOT EXISTS esi_code varchar(40);
