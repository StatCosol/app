/** Explicit legacy test fixtures verified in the 13-type audit test evidence.
 * Never classify by future year alone or by an incidental word in review notes.
 * Filters affect operational aggregates only; evidence and detail records remain intact.
 */
export const LEGACY_TEST_AUDIT_CODES = [
  'AX-2099-48EF3CF2FE89',
  'AX-2099-A43C1AABE95D',
  'AX-2099-5A7B92519574',
  'AX-2099-682447DB8105',
  'AX-2099-97708B2AA679',
  'AX-2099-99064987CAC6',
  'AX-2099-18702A2A9389',
  'AX-2099-7F2629C57089',
  'AX-2099-7D012B4E91F9',
  'AX-2099-94EA7073B4E8',
  'AX-2099-2EA1A4FCDFC7',
  'AX-2099-6B9C1FB33015',
  'AX-2099-1F65C3C9590D',
] as const;
const TEST_MARKER = '^(TEST ONLY|SYNTHETIC TEST ONLY)([ _-]|$)';
function column(alias: string, name: string): string {
  if (alias && !/^[a-z][a-z0-9_]*$/i.test(alias))
    throw new Error('Invalid SQL alias');
  return alias ? alias + '.' + name : name;
}
export function actualContractorDocumentSql(alias = ''): string {
  return ['file_name', 'title']
    .map(
      (name) =>
        `COALESCE(${column(alias, name)}, '') !~* '${name === 'file_name' ? '^TEST([_-]| ONLY([ _-]|$))' : TEST_MARKER}'`,
    )
    .join(' AND ');
}
/** Unit-document lists exclude only explicit fixture labels; detail access is unchanged. */
export function actualUnitDocumentSql(alias = 'd'): string {
  return ['file_name', 'remarks']
    .map(
      (name) =>
        `COALESCE(${column(alias, name)}, '') !~* '^(TEST[ _-]ONLY|SYNTHETIC[ _-]TEST[ _-]ONLY)([ _-]|$)'`,
    )
    .join(' AND ');
}
export function actualAuditObservationSql(alias = 'o'): string {
  return `COALESCE(${column(alias, 'observation')}, '') !~* '^(TEST[ _-]ONLY|SYNTHETIC[ _-]TEST[ _-]ONLY)([ _-]|$)' AND COALESCE(${column(alias, 'observation')}, '') !~* '^TEST-BRANCH-UI-[0-9]{8}.*Synthetic correction workflow check'`;
}
export function actualAuditSql(alias = 'a'): string {
  const codes = LEGACY_TEST_AUDIT_CODES.map((code) => "'" + code + "'").join(
    ',',
  );
  return `(COALESCE(${column(alias, 'notes')}, '') !~* '${TEST_MARKER}' AND NOT (${column(alias, 'branch_id')} IS NOT DISTINCT FROM '94ad1c42-ea05-460e-b494-0a7e634de127'::uuid AND COALESCE(${column(alias, 'audit_code')}, '') IN (${codes})))`;
}
