-- ⚠️ DEVELOPMENT ONLY
-- This script DROPS AND RECREATES statco_dev
-- DO NOT RUN AGAINST statco (production)

-- Reset statco_dev database completely
-- USE FOR DEVELOPMENT ONLY

-- Disconnect active sessions
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'statco_dev'
  AND pid <> pg_backend_pid();

-- Drop & recreate DB
DROP DATABASE IF EXISTS statco_dev;
CREATE DATABASE statco_dev;
ALTER DATABASE statco_dev OWNER TO postgres;

-- Connect to the fresh DB
\c statco_dev

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Baseline schema (SQL-managed; TypeORM migrations are disabled)
\i migrations/statco_schema_final.sql

-- Seeds
\i migrations/statco_seed_min.sql
