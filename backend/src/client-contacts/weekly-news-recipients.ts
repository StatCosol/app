import { DataSource } from 'typeorm';

export interface WeeklyNewsRecipient {
  email: string;
  sources: string[];
  included: boolean;
  reason: string | null;
}

interface RecipientSource {
  email: string;
  source: string;
  blocked: boolean;
}

export function resolveWeeklyNewsRecipients(
  rows: RecipientSource[],
): WeeklyNewsRecipient[] {
  const result = new Map<string, WeeklyNewsRecipient>();
  for (const row of rows) {
    const email = (row.email || '')
      .trim()
      .toLowerCase()
      .split(/#(?:branch-)?deleted#/)[0];
    if (!email) continue;
    const current = result.get(email) || {
      email,
      sources: [],
      included: true,
      reason: null,
    };
    if (!current.sources.includes(row.source)) current.sources.push(row.source);
    if (row.blocked) {
      current.included = false;
      current.reason = 'Removed or inactive contact/user';
    }
    if (!/^[^\s@#]+@[^\s@#]+\.[^\s@#]+$/.test(email)) {
      current.included = false;
      current.reason = 'Invalid email address';
    }
    if (email === 'sravan.kumar@vedhaentech.com') {
      current.included = false;
      current.reason = 'Excluded by request';
    }
    result.set(email, current);
  }
  return [...result.values()].sort((a, b) => a.email.localeCompare(b.email));
}

export async function weeklyNewsRecipientList(
  ds: DataSource,
  clientId: string,
): Promise<WeeklyNewsRecipient[]> {
  const rows: RecipientSource[] = await ds.query(
    `WITH client AS (
       SELECT id, primary_contact_email FROM clients
       WHERE id = $1 AND is_active = TRUE AND COALESCE(is_deleted, FALSE) = FALSE
     )
     SELECT primary_contact_email AS email, 'Primary contact / registered email' AS source, FALSE AS blocked FROM client
     UNION ALL
     SELECT c.email, 'Contact: ' || c.department, NOT c.is_active
     FROM client_department_contacts c JOIN client ON client.id = c.client_id
     WHERE c.department IN ('HR', 'COMPLIANCE', 'PAYROLL') OR c.is_active = FALSE
     UNION ALL
     SELECT u.email, 'User: ' || COALESCE(u.user_type, r.code),
            (u.deleted_at IS NOT NULL OR NOT u.is_active OR u.email LIKE '%#deleted#%' OR u.email LIKE '%#branch-deleted#%')
     FROM users u LEFT JOIN roles r ON r.id = u.role_id
     WHERE (EXISTS (SELECT 1 FROM client WHERE client.id = u.client_id)
       OR EXISTS (SELECT 1 FROM client_users cu JOIN client ON client.id = cu.client_id WHERE cu.user_id = u.id))
       AND (r.code = 'CLIENT' OR u.user_type IN ('MASTER', 'BRANCH'))
     UNION ALL
     SELECT u.email, 'Assigned payroll user',
            (u.deleted_at IS NOT NULL OR NOT u.is_active OR u.email LIKE '%#deleted#%' OR u.email LIKE '%#branch-deleted#%')
     FROM payroll_client_assignments p JOIN client ON client.id = p.client_id
     JOIN users u ON u.id = p.payroll_user_id JOIN roles r ON r.id = u.role_id
     WHERE p.status = 'ACTIVE' AND p.end_date IS NULL AND p.start_date <= CURRENT_DATE AND r.code = 'PAYROLL'`,
    [clientId],
  );
  return resolveWeeklyNewsRecipients(rows);
}
