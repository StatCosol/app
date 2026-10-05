/** Search visible identity and status fields, without changing the loaded lists. */
export function filterFaceDeskRows<T>(rows: T[], query: string, branchName: (id: string) => string): T[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return rows;
  const fields = ['name', 'employeeName', 'employeeCode', 'branchName', 'subjectType',
    'enrollmentStatus', 'duplicateStatus', 'status', 'attendanceStatus', 'punchType',
    'newEmployeeName', 'newEmployeeCode', 'matchedEmployeeName', 'matchedEmployeeCode'];
  return rows.filter(row => {
    const record = row as Record<string, unknown>;
    const values = fields.map(key => record[key]);
    for (const key of ['branchId', 'newBranchId', 'matchedBranchId']) {
      if (record[key]) values.push(branchName(String(record[key])));
    }
    return values.some(value => value != null && String(value).toLocaleLowerCase().includes(term));
  });
}
