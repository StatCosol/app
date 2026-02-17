-- Migration: Create approval_requests table
-- Date: 2026-02-05
-- Purpose: Enable approval workflow for sensitive operations

BEGIN;

CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('DELETE_BRANCH', 'DELETE_CONTRACTOR', 'DELETE_USER', 'PAYROLL_FINALIZATION')),
  requester_user_id UUID NOT NULL REFERENCES users(id),
  approver_user_id UUID REFERENCES users(id),
  status VARCHAR(30) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  target_entity_id UUID NOT NULL,
  target_entity_type VARCHAR(50) NOT NULL,
  reason TEXT,
  approver_notes TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_approval_req_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_req_requester ON approval_requests(requester_user_id);
CREATE INDEX IF NOT EXISTS idx_approval_req_approver ON approval_requests(approver_user_id);
CREATE INDEX IF NOT EXISTS idx_approval_req_target ON approval_requests(target_entity_id, target_entity_type);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_approval_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_approval_requests_updated_at ON approval_requests;

CREATE TRIGGER trigger_update_approval_requests_updated_at
BEFORE UPDATE ON approval_requests
FOR EACH ROW
EXECUTE FUNCTION update_approval_requests_updated_at();

COMMIT;
