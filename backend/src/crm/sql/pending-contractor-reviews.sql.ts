import { actualContractorDocumentSql } from '../../common/actual-records';
// One shared scope for the all-period counter and its paged dashboard list.
export const PENDING_CONTRACTOR_REVIEWS_FROM = `
FROM contractor_documents cd
JOIN client_branches b ON b.id = cd.branch_id
JOIN clients c ON c.id = b.clientid
WHERE cd.status IN ('UPLOADED', 'PENDING_REVIEW')
  AND ${actualContractorDocumentSql('cd')}
  AND EXISTS (
    SELECT 1 FROM client_assignments_current cac
    WHERE cac.client_id = c.id AND cac.assigned_to_user_id = $1
      AND cac.assignment_type = 'CRM'
  )`;
export const PENDING_CONTRACTOR_REVIEWS_COUNT = `SELECT COUNT(*)::int AS count ${PENDING_CONTRACTOR_REVIEWS_FROM}`;
