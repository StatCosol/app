# Contract employee ID repair — 12 September 2026

Production had 90 contract employees and 88 missing employee codes. The existing allocator used substring(employee_code from $2), which PostgreSQL resolved as its text-pattern overload. With a synthetic SBS0001 and parameter 4, production PostgreSQL returned NULL; explicitly casting the position to integer returned 0001. This restarted allocation at an already used code and the unique index correctly rejected the write.

The bounded maintenance backfill used the existing per-client transaction lock and NULL-only update, with the integer-cast correction applied to the allocation query. It assigned 88 IDs. A separate production query confirmed 90 total employees, zero missing codes and zero duplicate client/code groups. The two pre-existing codes were excluded from the update. No employee names, identity documents, passwords or connection secrets are recorded here.

Permanent changes:
- Explicit integer substring position and bigint sequence parsing.
- Stable selection of an existing generated prefix; neutral CE prefix for names without English letters.
- Backfill includes NULL/blank values, scopes each write by client and reports only affected rows.
- Contractor screen displays/searches employee IDs; Excel exports distinguish them from biometric punch codes.
- Maintenance script defaults to a read-only count; --apply runs batches with the service allocator until complete, stopping if no progress is made. Run from backend with its configured database environment; it requires development dependencies (ts-node).

Validation: 30 backend allocator/backfill tests and four Angular browser export/search tests passed; backend TypeScript compilation passed. Production SQL verified the overload behavior and final backfill totals. The frontend and permanent backend code changes still require PR merge/deployment; the data backfill is already complete.
