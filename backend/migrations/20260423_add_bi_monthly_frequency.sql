-- Add BI_MONTHLY to audits.frequency enum type if audits.frequency is enum.
-- Safe no-op when frequency is already varchar/text.

DO $$
DECLARE
  freq_type text;
BEGIN
  SELECT c.udt_name
  INTO freq_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'audits'
    AND c.column_name = 'frequency';

  IF freq_type IS NULL THEN
    RAISE NOTICE 'audits.frequency column not found';
    RETURN;
  END IF;

  IF freq_type IN ('varchar', 'text', 'bpchar') THEN
    RAISE NOTICE 'audits.frequency is % (not enum), skipping enum update', freq_type;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = freq_type
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = freq_type
        AND e.enumlabel = 'BI_MONTHLY'
    ) THEN
      EXECUTE format('ALTER TYPE %I.%I ADD VALUE ''BI_MONTHLY''', 'public', freq_type);
      RAISE NOTICE 'Added BI_MONTHLY to enum type %.%', 'public', freq_type;
    ELSE
      RAISE NOTICE 'BI_MONTHLY already exists in enum type %.%', 'public', freq_type;
    END IF;
  ELSE
    RAISE NOTICE 'Enum type % not found in public schema, skipping', freq_type;
  END IF;
END $$;
