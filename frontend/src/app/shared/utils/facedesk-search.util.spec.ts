import { describe, expect, it } from 'vitest';
import { filterFaceDeskRows } from './facedesk-search.util';
describe('kiosk record search', () => {
 const rows = [{ employeeName: 'Kavita', employeeCode: 'SS0119', branchId: 'b' }, { name: 'Pansuri', employeeCode: 'SS0198', branchId: null }];
 const branch = (id: string) => id === 'b' ? 'Hayathabad' : '';
 it('finds names, codes and resolved branch names with case and whitespace handling', () => {
  for (const query of [' kavita ', 'ss0119', 'HAYATHABAD']) expect(filterFaceDeskRows(rows, query, branch)).toEqual([rows[0]]);
  expect(filterFaceDeskRows(rows, 'pansuri', branch)).toEqual([rows[1]]);
 });
 it('clearing search restores the original list without modifying it', () => {
  expect(filterFaceDeskRows(rows, 'unknown', branch)).toEqual([]);
  expect(filterFaceDeskRows(rows, '', branch)).toBe(rows);
  expect(rows).toHaveLength(2);
 });
 it('matches either person in a duplicate alert', () => {
  const alerts = [{ newEmployeeName: 'Kavita', matchedEmployeeCode: 'SS0198' }];
  expect(filterFaceDeskRows(alerts, 'SS0198', branch)).toEqual(alerts);
 });
});
