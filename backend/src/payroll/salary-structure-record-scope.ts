// Explicit fixture labels only. An incidental word such as "testing" or a
// future effective date must never hide an operational salary structure.
const EXPLICIT_MARKER =
  '^[[:space:]]*(SYNTHETIC[ _-]TEST[ _-]ONLY|TEST[ _-]ONLY)([[:space:].:_-]|$)';
const PAYROLL_MARKER = `${EXPLICIT_MARKER}|^[[:space:]]*TEST[_-]`;

/** Fixed application-owned aliases from the CCO approval query; no user SQL. */
export function salaryStructureTestSql(): string {
  return `(COALESCE(ps.name, '') ~* '${PAYROLL_MARKER}'
    OR COALESCE(c.client_name, '') ~* '${EXPLICIT_MARKER}'
    OR LOWER(BTRIM(COALESCE(c.client_name, ''))) = 'test client'
    OR (ps.scope_type = 'EMPLOYEE' AND (
      COALESCE(e.name, '') ~* '${PAYROLL_MARKER}'
      OR COALESCE(e.employee_code, '') ~* '${PAYROLL_MARKER}'
    )))`;
}
