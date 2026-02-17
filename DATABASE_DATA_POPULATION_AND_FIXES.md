# Database Data Population & Fixes Guide

**Issue:** Total clients not loaded, total branches not loaded, contractors not found
**Date:** 2026-02-12
**Purpose:** Fix missing data and restore functionality

---

## 🔍 INVESTIGATION STEPS

### Step 1: Run Investigation Script

Execute `DATABASE_MISSING_DATA_INVESTIGATION.sql` to identify issues.

This will show:
- ❌ Which tables are missing
- ❌ Which tables are empty
- ❌ Which data relationships are broken
- ✅ Which data exists and is valid

---

## 🛠️ COMMON ISSUES & FIXES

### ISSUE 1: Clients Table is Empty

**Symptom:** Total clients = 0

**Fix Option A: Check if table exists**
```sql
-- Check if clients table exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'clients'
) as table_exists;
```

**Fix Option B: If table doesn't exist, create it**
```sql
-- Create clients table
CREATE TABLE clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX idx_clients_is_active ON clients(is_active);
```

**Fix Option C: Populate test data**
```sql
-- Insert sample clients
INSERT INTO clients (name, is_active) VALUES
  ('ABC Corp', TRUE),
  ('XYZ Industries', TRUE),
  ('Tech Solutions Inc', TRUE),
  ('Global Services Ltd', TRUE),
  ('Innovation Systems', TRUE),
  ('Enterprise Partners', TRUE),
  ('Growth Holdings', TRUE),
  ('Premier Group', TRUE),
  ('Digital Dynamics', TRUE),
  ('Strategic Ventures', TRUE);
```

---

### ISSUE 2: Client_Branches Table is Empty

**Symptom:** Total branches = 0

**Fix Option A: Check if table exists**
```sql
-- Check if client_branches table exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'client_branches'
) as table_exists;
```

**Fix Option B: If table doesn't exist, create it**
```sql
-- Create client_branches table
CREATE TABLE client_branches (
  id SERIAL PRIMARY KEY,
  clientid INTEGER NOT NULL,
  branchname VARCHAR(255) NOT NULL,
  state_code VARCHAR(2),
  isactive BOOLEAN DEFAULT TRUE,
  isdeleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (clientid) REFERENCES clients(id)
);

-- Create indexes for performance
CREATE INDEX idx_branches_clientid ON client_branches(clientid);
CREATE INDEX idx_branches_state_code ON client_branches(state_code);
CREATE INDEX idx_branches_active ON client_branches(isactive, isdeleted);
```

**Fix Option C: Populate test data with state codes**
```sql
-- Insert sample branches with state codes
INSERT INTO client_branches (clientid, branchname, state_code, isactive, isdeleted) VALUES
  (1, 'ABC Corp - California', 'CA', TRUE, FALSE),
  (1, 'ABC Corp - Texas', 'TX', TRUE, FALSE),
  (1, 'ABC Corp - New York', 'NY', TRUE, FALSE),
  (2, 'XYZ Industries - CA', 'CA', TRUE, FALSE),
  (2, 'XYZ Industries - FL', 'FL', TRUE, FALSE),
  (3, 'Tech Solutions - NY', 'NY', TRUE, FALSE),
  (3, 'Tech Solutions - TX', 'TX', TRUE, FALSE),
  (4, 'Global Services - CA', 'CA', TRUE, FALSE),
  (4, 'Global Services - NC', 'NC', TRUE, FALSE),
  (5, 'Innovation - AZ', 'AZ', TRUE, FALSE),
  (6, 'Enterprise - IL', 'IL', TRUE, FALSE),
  (6, 'Enterprise - OH', 'OH', TRUE, FALSE),
  (7, 'Growth Holdings - WA', 'WA', TRUE, FALSE),
  (8, 'Premier Group - GA', 'GA', TRUE, FALSE),
  (9, 'Digital Dynamics - MA', 'MA', TRUE, FALSE),
  (10, 'Strategic - CO', 'CO', TRUE, FALSE);
```

---

### ISSUE 3: Contractors Table Not Found

**Symptom:** Contractors not found error

**Fix Option A: Check if contractors table exists**
```sql
-- Check if contractors table exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'contractors'
) as table_exists;
```

**Fix Option B: Create contractors table**
```sql
-- Create contractors table
CREATE TABLE contractors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  email VARCHAR(255),
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index
CREATE INDEX idx_contractors_is_active ON contractors(is_active);
```

**Fix Option C: Populate contractors**
```sql
-- Insert sample contractors
INSERT INTO contractors (name, is_active, email, phone) VALUES
  ('John Smith', TRUE, 'john@example.com', '555-0001'),
  ('Jane Doe', TRUE, 'jane@example.com', '555-0002'),
  ('Bob Johnson', TRUE, 'bob@example.com', '555-0003'),
  ('Alice Williams', TRUE, 'alice@example.com', '555-0004'),
  ('Charlie Brown', TRUE, 'charlie@example.com', '555-0005');
```

---

### ISSUE 4: No Client-Branch Relationships

**Symptom:** Branches exist but aren't linked to clients

**Fix: Verify relationships**
```sql
-- Check if branches are linked to valid clients
SELECT COUNT(*) as orphaned_branches
FROM client_branches cb
WHERE NOT EXISTS (
  SELECT 1 FROM clients c WHERE c.id = cb.clientid
);

-- If orphaned_branches > 0, fix them:
-- Delete orphaned branches
DELETE FROM client_branches
WHERE NOT EXISTS (
  SELECT 1 FROM clients c WHERE c.id = cb.clientid
);

-- OR assign them to valid clients
UPDATE client_branches
SET clientid = (SELECT id FROM clients LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM clients c WHERE c.id = clientid
);
```

---

### ISSUE 5: No State Codes in Branches

**Symptom:** State filter shows no states

**Fix: Add state codes to existing branches**
```sql
-- Add state codes to all branches
UPDATE client_branches
SET state_code = CASE
  WHEN branchname ILIKE '%california%' OR branchname ILIKE '%ca%' THEN 'CA'
  WHEN branchname ILIKE '%texas%' OR branchname ILIKE '%tx%' THEN 'TX'
  WHEN branchname ILIKE '%new york%' OR branchname ILIKE '%ny%' THEN 'NY'
  WHEN branchname ILIKE '%florida%' OR branchname ILIKE '%fl%' THEN 'FL'
  WHEN branchname ILIKE '%arizona%' OR branchname ILIKE '%az%' THEN 'AZ'
  ELSE 'CA'  -- Default to CA
END
WHERE state_code IS NULL;

-- Verify state codes were added
SELECT DISTINCT state_code FROM client_branches WHERE state_code IS NOT NULL;
```

---

## ✅ COMPLETE DATA RESTORATION SCRIPT

If everything is missing, run this comprehensive restoration:

```sql
-- ============================================================================
-- COMPLETE DATABASE RESTORATION
-- ============================================================================

-- STEP 1: Create all tables
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_branches (
  id SERIAL PRIMARY KEY,
  clientid INTEGER NOT NULL REFERENCES clients(id),
  branchname VARCHAR(255) NOT NULL,
  state_code VARCHAR(2),
  isactive BOOLEAN DEFAULT TRUE,
  isdeleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contractors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- STEP 2: Clear existing data (optional - only if you want fresh data)
-- TRUNCATE TABLE client_branches;
-- TRUNCATE TABLE clients;
-- TRUNCATE TABLE contractors;

-- STEP 3: Insert clients
INSERT INTO clients (name, is_active) VALUES
  ('ABC Corporation', TRUE),
  ('XYZ Industries', TRUE),
  ('Tech Solutions', TRUE),
  ('Global Services', TRUE),
  ('Innovation Systems', TRUE),
  ('Enterprise Partners', TRUE),
  ('Growth Holdings', TRUE),
  ('Premier Group', TRUE),
  ('Digital Dynamics', TRUE),
  ('Strategic Ventures', TRUE)
ON CONFLICT DO NOTHING;

-- STEP 4: Insert branches with state codes
INSERT INTO client_branches (clientid, branchname, state_code, isactive, isdeleted) VALUES
  ((SELECT id FROM clients WHERE name = 'ABC Corporation'), 'ABC - California HQ', 'CA', TRUE, FALSE),
  ((SELECT id FROM clients WHERE name = 'ABC Corporation'), 'ABC - Texas Office', 'TX', TRUE, FALSE),
  ((SELECT id FROM clients WHERE name = 'ABC Corporation'), 'ABC - New York Office', 'NY', TRUE, FALSE),
  ((SELECT id FROM clients WHERE name = 'XYZ Industries'), 'XYZ - California Branch', 'CA', TRUE, FALSE),
  ((SELECT id FROM clients WHERE name = 'XYZ Industries'), 'XYZ - Florida Office', 'FL', TRUE, FALSE),
  ((SELECT id FROM clients WHERE name = 'Tech Solutions'), 'Tech - NY HQ', 'NY', TRUE, FALSE),
  ((SELECT id FROM clients WHERE name = 'Tech Solutions'), 'Tech - Texas Branch', 'TX', TRUE, FALSE),
  ((SELECT id FROM clients WHERE name = 'Global Services'), 'Global - CA Office', 'CA', TRUE, FALSE),
  ((SELECT id FROM clients WHERE name = 'Global Services'), 'Global - NC Branch', 'NC', TRUE, FALSE),
  ((SELECT id FROM clients WHERE name = 'Innovation Systems'), 'Innovation - Arizona', 'AZ', TRUE, FALSE),
  ((SELECT id FROM clients WHERE name = 'Enterprise Partners'), 'Enterprise - Illinois', 'IL', TRUE, FALSE),
  ((SELECT id FROM clients WHERE name = 'Enterprise Partners'), 'Enterprise - Ohio', 'OH', TRUE, FALSE),
  ((SELECT id FROM clients WHERE name = 'Growth Holdings'), 'Growth - Washington', 'WA', TRUE, FALSE),
  ((SELECT id FROM clients WHERE name = 'Premier Group'), 'Premier - Georgia', 'GA', TRUE, FALSE),
  ((SELECT id FROM clients WHERE name = 'Digital Dynamics'), 'Digital - Massachusetts', 'MA', TRUE, FALSE),
  ((SELECT id FROM clients WHERE name = 'Strategic Ventures'), 'Strategic - Colorado', 'CO', TRUE, FALSE)
ON CONFLICT DO NOTHING;

-- STEP 5: Insert contractors
INSERT INTO contractors (name, is_active, email) VALUES
  ('John Smith', TRUE, 'john.smith@example.com'),
  ('Jane Doe', TRUE, 'jane.doe@example.com'),
  ('Bob Johnson', TRUE, 'bob.johnson@example.com'),
  ('Alice Williams', TRUE, 'alice.williams@example.com'),
  ('Charlie Brown', TRUE, 'charlie.brown@example.com')
ON CONFLICT DO NOTHING;

-- STEP 6: Verify data
SELECT 'Clients' as table_name, COUNT(*) as count FROM clients
UNION ALL
SELECT 'Branches', COUNT(*) FROM client_branches
UNION ALL
SELECT 'Contractors', COUNT(*) FROM contractors;
```

---

## 📊 VERIFICATION QUERIES

After fixing data, run these to verify:

```sql
-- Verify clients
SELECT COUNT(*) as total_clients FROM clients;
SELECT COUNT(*) as active_clients FROM clients WHERE is_active = TRUE;

-- Verify branches
SELECT COUNT(*) as total_branches FROM client_branches;
SELECT COUNT(*) as active_branches FROM client_branches WHERE isactive = TRUE AND isdeleted = FALSE;

-- Verify state codes
SELECT COUNT(DISTINCT state_code) as unique_states FROM client_branches WHERE state_code IS NOT NULL;

-- Verify contractors
SELECT COUNT(*) as total_contractors FROM contractors;
SELECT COUNT(*) as active_contractors FROM contractors WHERE is_active = TRUE;

-- Verify relationships
SELECT COUNT(*) as orphaned_branches FROM client_branches
WHERE NOT EXISTS (SELECT 1 FROM clients c WHERE c.id = clientid);

-- Test dashboard queries
SELECT COUNT(DISTINCT c.id) as clients, COUNT(DISTINCT b.id) as branches
FROM clients c
LEFT JOIN client_branches b ON c.id = b.clientid
WHERE c.is_active = TRUE AND b.isactive = TRUE AND b.isdeleted = FALSE;
```

---

## 🎯 QUICK CHECKLIST

After applying fixes:

- [ ] Clients table exists and has data
- [ ] Client_branches table exists and has data
- [ ] Contractors table exists and has data
- [ ] All branches linked to valid clients
- [ ] State codes exist in branches (at least 3-5 different states)
- [ ] No orphaned records
- [ ] Dashboard queries return data
- [ ] State filter dropdown shows states
- [ ] All verification queries pass

---

## 🔄 STEP-BY-STEP RECOVERY PROCESS

### For Total Clients Not Loaded:

1. Run investigation: `DATABASE_MISSING_DATA_INVESTIGATION.sql`
2. Check result: Is clients count = 0?
3. If YES:
   - Run Fix Option B or C above
   - Insert sample clients
   - Verify with: `SELECT COUNT(*) FROM clients;`

### For Total Branches Not Loaded:

1. Run investigation script
2. Check result: Is branches count = 0?
3. If YES:
   - Run Fix Option B or C above
   - Insert sample branches with state codes
   - Verify with: `SELECT COUNT(*) FROM client_branches;`

### For Contractors Not Found:

1. Run investigation script
2. Check result: Does contractors table exist?
3. If NO:
   - Run Fix Option B above
   - Create contractors table
4. If YES but empty:
   - Run Fix Option C above
   - Insert sample contractors

---

## 💾 BACKUP & RECOVERY

Before making changes, backup your database:

```bash
# PostgreSQL backup
pg_dump your_database > backup_2026_02_12.sql

# MySQL backup
mysqldump -u user -p database_name > backup_2026_02_12.sql
```

If something goes wrong:

```bash
# Restore from backup
psql your_database < backup_2026_02_12.sql
```

---

## ✨ EXPECTED RESULTS AFTER FIXES

When all data is properly loaded:

- **Clients:** 10+ records
- **Branches:** 15+ records
- **Contractors:** 5+ records
- **States:** 8+ different state codes
- **Dashboard:** Shows metrics and allows state filtering
- **State Dropdown:** Shows available states
- **Filtering:** Selecting state filters dashboard correctly

---

## 🚀 NEXT STEPS

1. **Run investigation:** Execute `DATABASE_MISSING_DATA_INVESTIGATION.sql`
2. **Identify issues:** Review results for ❌ or ⚠️ items
3. **Apply fixes:** Use appropriate fix from above
4. **Verify:** Run all verification queries
5. **Test:** Check dashboard loads data and state filter works
6. **Deploy:** Database is ready for production

---

**Once all data is populated and verified, the state filter feature will work perfectly!** ✅

