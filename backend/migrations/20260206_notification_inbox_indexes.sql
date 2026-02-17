-- Notification Inbox/Outbox Indexes
-- Add these indexes for optimal query performance

-- Index for inbox queries (assigned_to_user_id + status + created_at)
CREATE INDEX IF NOT EXISTS idx_notifications_assigned_to_status
ON notifications(assigned_to_user_id, status, created_at DESC);

-- Index for outbox queries (created_by_user_id + created_at)
CREATE INDEX IF NOT EXISTS idx_notifications_created_by_created
ON notifications(created_by_user_id, created_at DESC);

-- Index for client filtering
CREATE INDEX IF NOT EXISTS idx_notifications_client
ON notifications(client_id)
WHERE client_id IS NOT NULL;

-- Index for query type filtering
CREATE INDEX IF NOT EXISTS idx_notifications_query_type
ON notifications(query_type)
WHERE query_type IS NOT NULL;

-- Index for branch filtering
CREATE INDEX IF NOT EXISTS idx_notifications_branch
ON notifications(branch_id)
WHERE branch_id IS NOT NULL;

-- Add read_at column if not exists (for tracking when notification was read)
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ DEFAULT NULL;

-- Comment on indexes
COMMENT ON INDEX idx_notifications_assigned_to_status IS 'Optimizes inbox queries with status filtering';
COMMENT ON INDEX idx_notifications_created_by_created IS 'Optimizes outbox/sent queries';
COMMENT ON INDEX idx_notifications_client IS 'Client-based notification filtering';
COMMENT ON INDEX idx_notifications_query_type IS 'Query type filtering (TECHNICAL/COMPLIANCE/AUDIT)';
COMMENT ON INDEX idx_notifications_branch IS 'Branch-based notification filtering';
