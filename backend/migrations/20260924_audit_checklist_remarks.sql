-- Preserve auditor remarks separately from document-generated suggestions.
ALTER TABLE audit_checklist_items ADD COLUMN IF NOT EXISTS automated_remarks text;
ALTER TABLE audit_checklist_items ADD COLUMN IF NOT EXISTS automation_reviewed boolean NOT NULL DEFAULT false;
