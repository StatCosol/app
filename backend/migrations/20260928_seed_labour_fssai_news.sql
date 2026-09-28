-- 2026-09-28 - publish latest labour and FSSAI compliance news.
-- Idempotent seed for the admin news ticker/client portal.

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT u.id
    INTO v_user_id
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
   WHERE u.deleted_at IS NULL
     AND (
       lower(u.email) IN ('admin@statcosol.com', 'it_admin@statcosol.com')
       OR r.code = 'ADMIN'
     )
   ORDER BY
     CASE
       WHEN lower(u.email) = 'admin@statcosol.com' THEN 0
       WHEN lower(u.email) = 'it_admin@statcosol.com' THEN 1
       WHEN r.code = 'ADMIN' THEN 2
       ELSE 3
     END,
     u.created_at ASC
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Skipping labour/FSSAI news seed: no admin user found';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM news_items
     WHERE title = 'Weekly Compliance Update: Labour and FSSAI regulatory news - September 2026'
       AND deleted_at IS NULL
  ) THEN
    INSERT INTO news_items (
      title,
      body,
      category,
      pinned,
      is_active,
      expires_at,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      'Weekly Compliance Update: Labour and FSSAI regulatory news - September 2026',
      $body$Latest compliance update for client review:

1. Ministry of Labour & Employment: The Ministry press-release page lists a 16 September 2026 update on Cabinet approval for a higher EPFO wage ceiling of Rs. 25,000, expanding mandatory coverage. Employers should watch for the operative notification/circular and assess EPF coverage impact for employees near the wage threshold.

2. Ministry of Labour & Employment / EPFO: The Ministry press-release page also lists September 2026 updates on VISHWAS, 2026 for settlement of long-pending EPF damages disputes at reduced rates and amnesty provisions for retrospective regularization of exempt PF trust status. Establishments with pending EPF damages/exempt-trust issues should review eligibility once detailed instructions are available.

3. Ministry of Labour & Employment: The BOCW national conference updates issued during 9-12 September 2026 focus on strengthening worker welfare and skilling for construction workers. Principal employers and contractors should keep BOCW registration, cess, welfare, and worker-benefit records current.

4. FSSAI: The FSSAI Notifications page lists a 24 September 2026 draft Food Safety and Standards (Prohibition and Restrictions on Sales) Amendment Regulations, 2026 relating to restrictions on paneer made of constituents not derived from milk. Food business operators handling milk/paneer products should review the draft and comment process.

5. FSSAI: The FSSAI Notifications and Advisories/Orders pages list 18 September 2026 updates on laboratory/sample-analysis timelines, test-report formats, food analyst notifications, and timely analysis/reporting by referral laboratories. Food businesses should check whether their testing, reporting, import, or laboratory workflows are affected.

Official source pages:
https://www.labour.gov.in/documents/press-release?page=1
https://fssai.gov.in/food-law/notifications
https://fssai.gov.in/food-law/advisories$body$,
      'COMPLIANCE',
      TRUE,
      TRUE,
      TIMESTAMPTZ '2026-10-31 23:59:59+05:30',
      v_user_id,
      NOW(),
      NOW()
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM news_items
     WHERE title = 'All-State Labour Update: Minimum wages revision tracker'
       AND deleted_at IS NULL
  ) THEN
    INSERT INTO news_items (
      title,
      body,
      category,
      pinned,
      is_active,
      expires_at,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      'All-State Labour Update: Minimum wages revision tracker',
      $body$State-wise minimum wages are revised through state labour department notifications and are commonly refreshed in the portal master around April and October, or whenever a state issues a revised notification.

StatCo will include the latest active minimum-wage master entries in the weekly Monday 9 AM compliance-news email. Clients should review the rates by:

1. State code
2. Skill category: UNSKILLED, SEMI_SKILLED, SKILLED, HIGHLY_SKILLED
3. Scheduled employment, where applicable
4. Effective-from and effective-to dates
5. Source/notification reference captured in the master

Action required:
- Payroll and HR teams should compare employee and contractor wages against the applicable state minimum wage before monthly payroll closure.
- CRM/compliance teams should upload or refresh state notifications in the Minimum Wages master as soon as revised rates are notified.
- Branch and client users should treat the portal master as the operating tracker and verify applicability against the relevant state notification for their industry and establishment type.

This update covers all configured states in the portal minimum-wage master and will be included in the weekly compliance-news mail to clients.$body$,
      'COMPLIANCE',
      TRUE,
      TRUE,
      TIMESTAMPTZ '2026-10-31 23:59:59+05:30',
      v_user_id,
      NOW(),
      NOW()
    );
  END IF;
END $$;
