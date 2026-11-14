import {
  actualAuditObservationSql,
  actualAuditSql,
} from '../common/actual-records';

/** Keep fixture closure requests out of CRM's operational queue without changing
 * tickets or their history. Classify the linked observation/audit, never incidental
 * words in a customer's correction text. Unlinked requests remain visible.
 */
export function actualAuditRequestSql(): string {
  return `NOT EXISTS (
    SELECT 1 FROM audit_observations request_observation
    INNER JOIN audits request_audit ON request_audit.id = request_observation.audit_id
    WHERE t.category = 'AUDIT'
      AND t.sub_category = 'AUDIT_OBSERVATION_CLOSURE'
      AND request_audit.client_id = t.client_id
      AND (t.branch_id IS NULL OR request_audit.branch_id = t.branch_id)
      AND request_observation.id::text = lower(substring(t.description FROM
        '(?:^|[\\r\\n])Observation ID: *([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})(?:[\\r\\n]|$)'))
      AND NOT ((${actualAuditSql('request_audit')}) AND (${actualAuditObservationSql('request_observation')}))
  )`;
}
