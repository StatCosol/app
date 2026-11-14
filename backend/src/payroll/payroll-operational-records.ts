/** Same explicit run markers as the operational-list SQL predicate below. */
export function isTestPayrollRecord(
  ...values: (string | null | undefined)[]
): boolean {
  return values.some((value) =>
    /^\s*(?:(?:SYNTHETIC TEST ONLY|TEST ONLY)(?:[\s:_-]|$)|TEST[_-])/i.test(
      value ?? '',
    ),
  );
}

/** Apply only to fixed application-owned column expressions, never request input. */
export function excludeTestPayrollRecords(
  qb: { andWhere: (sql: string, params?: any) => any },
  columns: readonly string[],
): void {
  const marker =
    '^[[:space:]]*(SYNTHETIC TEST ONLY|TEST ONLY)([[:space:]:_-]|$)|^[[:space:]]*TEST[_-]';
  qb.andWhere(
    `NOT (${columns.map((column) => `COALESCE(${column}, '') ~* :payrollTestMarker`).join(' OR ')})`,
    { payrollTestMarker: marker },
  );
}
