-- Migration: Create compliance_notification_center table
-- Created: 2026-03-26

CREATE TABLE IF NOT EXISTS "compliance_notification_center" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "clientId" uuid,
  "branchId" uuid,
  "role" character varying(30) NOT NULL,
  "module" character varying(50) NOT NULL,
  "title" character varying(255) NOT NULL,
  "message" text NOT NULL,
  "status" character varying(20) NOT NULL DEFAULT 'OPEN',
  "priority" character varying(20) NOT NULL DEFAULT 'MEDIUM',
  "entityId" uuid,
  "entityType" character varying(30),
  "dueDate" date,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_compliance_notification_center" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_compliance_notification_center_clientId"
ON "compliance_notification_center" ("clientId");

CREATE INDEX IF NOT EXISTS "IDX_compliance_notification_center_role_status"
ON "compliance_notification_center" ("role", "status");
