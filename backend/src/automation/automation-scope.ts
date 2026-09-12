import { AutomationOptions } from './control-schedule';
import { DataSource } from 'typeorm';

export interface AutomationScope {
  options?: AutomationOptions;
  clientId?: string;
  branchId?: string;
  excludedClientIds?: string[];
  excludedBranchIds?: string[];
}

/** Scope both previews and execution through the same parameterized predicate. */
export function scopedRows(
  ds: DataSource,
  sql: string,
  values: unknown[],
  scope: AutomationScope = {},
) {
  const params = [...values];
  const bind = (value: unknown) => {
    params.push(value);
    return '$' + params.length;
  };
  const where: string[] = ['TRUE'];
  if (scope.clientId)
    where.push('client_id = ' + bind(scope.clientId) + '::uuid');
  if (scope.branchId)
    where.push('branch_id = ' + bind(scope.branchId) + '::uuid');
  if (scope.excludedClientIds?.length)
    where.push(
      '(client_id IS NULL OR client_id <> ALL(' +
        bind(scope.excludedClientIds) +
        '::uuid[]))',
    );
  if (scope.excludedBranchIds?.length)
    where.push(
      '(branch_id IS NULL OR branch_id <> ALL(' +
        bind(scope.excludedBranchIds) +
        '::uuid[]))',
    );
  return ds.query(
    `SELECT * FROM (${sql}) scoped WHERE ${where.join(' AND ')}`,
    params,
  );
}
