/** Only portal-internal routes; destination role/module guards still authorize access. */
export function safePortalReturnUrl(value: unknown): string | null {
  return typeof value === 'string' && /^\/(admin|crm|auditor|cco|ceo|client|branch|contractor|payroll|pf-team|accounts|sales)(?:\/|\?|$)/.test(value) && !/[\\\r\n]/.test(value) ? value : null;
}
