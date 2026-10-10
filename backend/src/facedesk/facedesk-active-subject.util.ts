/** Profiles may outlive roster deletion. Only current active subjects can match. */
export function activeFaceDeskSubjectSql(alias: string): string {
  return `(
    (${alias}.subject_type = 'EMPLOYEE' AND EXISTS (
      SELECT 1 FROM employees roster
      WHERE roster.id = ${alias}.employee_id
        AND roster.client_id = ${alias}.client_id AND roster.is_active = true
    )) OR
    (${alias}.subject_type = 'CONTRACTOR' AND EXISTS (
      SELECT 1 FROM contractor_employees roster
      WHERE roster.id = ${alias}.employee_id
        AND roster.client_id = ${alias}.client_id AND roster.is_active = true
    ))
  )`;
}
