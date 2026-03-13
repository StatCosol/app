These migrations were moved out of active execution because they are legacy/conflicting for the current schema baseline.

Typical conflicts:
- old column names (`contractor_id`, `unit_id`, `from_user_id`)
- old role table shape assumptions (`roles.description`, `roles.is_system`)
- duplicate/deprecated seed data
- broad reconciliation scripts that conflict with current views/types
- one-off rollback/sample/reset artifacts that should not run in normal forward migration flow

If one of these files is required for a specific environment, review and port it into a new idempotent migration before applying.
