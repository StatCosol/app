-- Check for users that should be filtered out but might be showing
SELECT 
    id,
    name,
    email,
    is_active,
    deleted_at,
    user_type,
    CASE 
        WHEN email LIKE '%#deleted#%' THEN 'Has #deleted# tag'
        WHEN email LIKE '%#branch-deleted#%' THEN 'Has #branch-deleted# tag'
        ELSE 'No deletion tag'
    END as email_tag_status
FROM users
WHERE 
    (deleted_at IS NOT NULL 
     OR is_active = false 
     OR email LIKE '%#deleted#%' 
     OR email LIKE '%#branch-deleted#%')
ORDER BY deleted_at DESC NULLS LAST
LIMIT 20;
