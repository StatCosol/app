import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema0000000000001 implements MigrationInterface {
  name = 'InitSchema0000000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TYPE "public"."client_branches_branchtype_enum" AS ENUM('HO', 'ZONAL', 'SALES', 'ESTABLISHMENT', 'FACTORY')`,
    );
    await queryRunner.query(
      `CREATE TABLE "client_branches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clientId" uuid NOT NULL, "branchName" character varying NOT NULL, "branchType" "public"."client_branches_branchtype_enum" NOT NULL, "address" text NOT NULL, "employeeCount" integer NOT NULL DEFAULT '0', "contractorCount" integer NOT NULL DEFAULT '0', "status" character varying NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "isActive" boolean NOT NULL DEFAULT true, "isDeleted" boolean NOT NULL DEFAULT false, "deletedAt" TIMESTAMP WITH TIME ZONE, "deletedBy" uuid, "deleteReason" text, CONSTRAINT "PK_d6ab17d5312bfef187899353e8b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_BRANCHES_CLIENTID" ON "client_branches" ("clientId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "roleId" integer NOT NULL, "name" character varying NOT NULL, "email" character varying NOT NULL, "mobile" character varying(20), "passwordHash" character varying NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "clientId" uuid, "deletedAt" TIMESTAMP WITH TIME ZONE, "ownerCcoId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_USERS_ROLEID" ON "users" ("roleId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_USERS_MOBILE" ON "users" ("mobile") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_USERS_CLIENTID" ON "users" ("clientId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "approvals" ("id" SERIAL NOT NULL, "type" character varying(50) NOT NULL, "entityType" character varying(50) NOT NULL, "entityId" bigint NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'PENDING', "reason" text NOT NULL, "decisionNote" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "decidedAt" TIMESTAMP, "requestedBy" uuid, "requestedTo" uuid, CONSTRAINT "PK_690417aaefa84d18b1a59e2a499" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "roles" ("id" SERIAL NOT NULL, "code" character varying NOT NULL, "name" character varying NOT NULL, "description" text, CONSTRAINT "UQ_f6d54f95c31b73fb1bdd8e91d0c" UNIQUE ("code"), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "deletion_audit" ("id" SERIAL NOT NULL, "entityType" character varying(50) NOT NULL, "entityId" bigint NOT NULL, "deletedAt" TIMESTAMP NOT NULL DEFAULT now(), "snapshot" jsonb, "approvalId" integer, "deletedBy" uuid, CONSTRAINT "PK_4256666ba022a0b17b97a3ce2ce" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "deletion_requests" ("id" SERIAL NOT NULL, "entityType" character varying(50) NOT NULL, "entityId" uuid NOT NULL, "requestedByUserId" uuid NOT NULL, "requiredApproverRole" character varying(20) NOT NULL, "requiredApproverUserId" uuid, "status" character varying(20) NOT NULL DEFAULT 'PENDING', "remarks" text, "requestedAt" TIMESTAMP NOT NULL DEFAULT now(), "resolvedAt" TIMESTAMP, CONSTRAINT "PK_f8ee986c713abeb93129e4bab0b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "clients" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clientCode" character varying NOT NULL, "clientName" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'ACTIVE', "isActive" boolean NOT NULL DEFAULT true, "isDeleted" boolean NOT NULL DEFAULT false, "deletedAt" TIMESTAMP WITH TIME ZONE, "deletedBy" uuid, "deleteReason" text, "assignedCrmId" uuid, "assignedAuditorId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_b9f9be3d281942f1b198ae071be" UNIQUE ("clientCode"), CONSTRAINT "PK_f1ab7cf3a5714dbc6bb4e1c28a4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "notification_threads" ("id" SERIAL NOT NULL, "client_id" uuid, "branch_id" uuid, "query_type" character varying(20) NOT NULL, "subject" character varying(200), "created_by_user_id" uuid NOT NULL, "assigned_to_user_id" uuid NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'OPEN', "thread_key" character varying(80), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b2f51dc0bc1f06b12ac6311ae54" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "notification_messages" ("id" SERIAL NOT NULL, "thread_id" integer NOT NULL, "from_user_id" uuid NOT NULL, "message" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_025a03ac35a495f0a6d8730350d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."compliance_master_frequency_enum" AS ENUM('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'EVENT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "compliance_master" ("id" SERIAL NOT NULL, "complianceName" character varying NOT NULL, "lawName" character varying NOT NULL, "frequency" "public"."compliance_master_frequency_enum" NOT NULL, "description" text, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_1ee8fce927b08a0d8d9a1182a1a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."compliance_applicability_branchtype_enum" AS ENUM('HO', 'ZONAL', 'SALES', 'ESTABLISHMENT', 'FACTORY')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."compliance_applicability_defaultownerrole_enum" AS ENUM('CRM', 'AUDITOR')`,
    );
    await queryRunner.query(
      `CREATE TABLE "compliance_applicability" ("id" SERIAL NOT NULL, "complianceId" integer NOT NULL, "branchType" "public"."compliance_applicability_branchtype_enum" NOT NULL, "defaultOwnerRole" "public"."compliance_applicability_defaultownerrole_enum" NOT NULL, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_1f8cf1a1dab6ebf9fc715897dee" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "compliance_tasks" ("id" SERIAL NOT NULL, "client_id" integer NOT NULL, "branch_id" uuid, "compliance_id" integer NOT NULL, "period_year" integer NOT NULL, "period_month" integer, "period_label" character varying(30), "assigned_to_user_id" uuid, "assigned_by_user_id" uuid NOT NULL, "due_date" date NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'PENDING', "remarks" text, "last_notified_at" TIMESTAMP, "escalated_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_204138d089f35800efce2207a5f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "compliance_comments" ("id" SERIAL NOT NULL, "task_id" integer NOT NULL, "user_id" integer NOT NULL, "message" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_905f4b2abdec34d6ca0992c294c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "compliance_evidence" ("id" SERIAL NOT NULL, "task_id" integer NOT NULL, "uploaded_by_user_id" integer NOT NULL, "file_name" character varying(255) NOT NULL, "file_path" character varying(500) NOT NULL, "file_type" character varying(50), "file_size" integer, "notes" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9a76f7d74321defb29662de2fcd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "client_users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clientId" uuid NOT NULL, "userId" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_fe74bfd4d01077395ee4204b553" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_CLIENT_USERS_CLIENTID" ON "client_users" ("clientId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_CLIENT_USERS_USERID_UNIQUE" ON "client_users" ("userId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."branch_compliances_status_enum" AS ENUM('PENDING', 'COMPLETED', 'OVERDUE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "branch_compliances" ("id" SERIAL NOT NULL, "clientId" integer NOT NULL, "branchId" integer NOT NULL, "complianceId" integer NOT NULL, "ownerUserId" integer NOT NULL, "dueDate" date, "status" "public"."branch_compliances_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "lastUpdated" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_8928aa06fa5869fc4835cac8ea9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "branch_contractors" ("id" SERIAL NOT NULL, "clientId" integer NOT NULL, "branchId" uuid NOT NULL, "contractorUserId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e70e52ce4b28fa54d6403b86147" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_BRANCH_CONTRACTORS_CLIENTID" ON "branch_contractors" ("clientId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_BRANCH_CONTRACTORS_CONTRACTOR" ON "branch_contractors" ("branchId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_BRANCH_CONTRACTORS_UNIQUE" ON "branch_contractors" ("branchId", "contractorUserId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audits_frequency_enum" AS ENUM('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'EVENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audits_audit_type_enum" AS ENUM('CONTRACTOR', 'FACTORY', 'SHOPS_ESTABLISHMENT', 'LABOUR_EMPLOYMENT', 'FSSAI', 'HR', 'PAYROLL')`,
    );
    await queryRunner.query(
      `CREATE TABLE "audits" ("id" SERIAL NOT NULL, "client_id" uuid NOT NULL, "contractor_user_id" uuid, "frequency" "public"."audits_frequency_enum" NOT NULL, "audit_type" "public"."audits_audit_type_enum" NOT NULL, "period_year" integer NOT NULL, "period_code" character varying(20) NOT NULL, "assigned_auditor_id" uuid NOT NULL, "created_by_user_id" uuid NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'PLANNED', "due_date" date, "notes" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b2d7a2089999197dc7024820f28" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "entityType" character varying(50) NOT NULL, "entityId" uuid NOT NULL, "action" character varying(50) NOT NULL, "performedBy" uuid, "performedRole" character varying(30), "performed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "reason" character varying(200), "beforeJson" jsonb, "afterJson" jsonb, CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_13c69424c440a0e765053feb4b" ON "audit_logs" ("entityType", "entityId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "client_crm_assignments" ("id" SERIAL NOT NULL, "clientId" integer NOT NULL, "crmId" integer NOT NULL, "assignedAt" TIMESTAMP NOT NULL DEFAULT now(), "validTill" TIMESTAMP WITH TIME ZONE NOT NULL, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_5ceb9547050dd0133ba921b039a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bedc56c00588ea998332eb9127" ON "client_crm_assignments" ("clientId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "client_auditor_assignments" ("id" SERIAL NOT NULL, "clientId" integer NOT NULL, "auditorId" integer NOT NULL, "assignedAt" TIMESTAMP NOT NULL DEFAULT now(), "validTill" TIMESTAMP WITH TIME ZONE NOT NULL, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_cb2244cfedce479c49d8bb44ff9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_36518b7c1639d41fe74154a7e4" ON "client_auditor_assignments" ("clientId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "client_assignment_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "client_id" uuid NOT NULL, "assignment_type" character varying NOT NULL, "assigned_to_user_id" uuid NOT NULL, "start_date" TIMESTAMP WITH TIME ZONE NOT NULL, "end_date" TIMESTAMP WITH TIME ZONE, "changed_by" uuid, "change_reason" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_09bf119a0ee5dde85e2eacec589" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_979cc6333d461a19a5b36f05ec" ON "client_assignment_history" ("client_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_25d6aed6c8497f4a3dc60962fe" ON "client_assignment_history" ("assignment_type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_11240c7d0820da9b5433efc68c" ON "client_assignment_history" ("client_id", "assignment_type", "start_date") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."client_assignments_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "client_assignments" ("id" SERIAL NOT NULL, "client_id" uuid NOT NULL, "crm_user_id" uuid, "auditor_user_id" uuid, "start_date" date NOT NULL, "end_date" date, "crm_assigned_from" date, "crm_assigned_to" date, "auditor_assigned_from" date, "auditor_assigned_to" date, "status" "public"."client_assignments_status_enum" NOT NULL DEFAULT 'ACTIVE', "created_by" integer, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3af234a4835d985328980066e6a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_CLIENT_ASSIGNMENTS_CLIENT_UNIQUE" ON "client_assignments" ("client_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "client_assignments_current" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clientId" uuid NOT NULL, "assignment_type" character varying NOT NULL, "assigned_to_user_id" uuid NOT NULL, "start_date" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2f90359e9091329c9d22e335d5e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_eaffd500b8c44132c3b81b3461" ON "client_assignments_current" ("clientId", "assignment_type") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_branches" ("user_id" uuid NOT NULL, "branch_id" uuid NOT NULL, CONSTRAINT "PK_79e020eef929e23dfdd6f9b8720" PRIMARY KEY ("user_id", "branch_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a93a8dec13e6204974dd67386e" ON "user_branches" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7252d91dd610730c97d6b58ae7" ON "user_branches" ("branch_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "approvals" ADD CONSTRAINT "FK_f4e55f0bc92584dce72797c5078" FOREIGN KEY ("requestedBy") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "approvals" ADD CONSTRAINT "FK_2a8561ab7c1f4a93bab57275799" FOREIGN KEY ("requestedTo") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "deletion_audit" ADD CONSTRAINT "FK_cadefdd74d86bd13aa501bf6b2d" FOREIGN KEY ("approvalId") REFERENCES "approvals"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "deletion_audit" ADD CONSTRAINT "FK_f8c95bbea64e5b3dfd3bb2fcbfd" FOREIGN KEY ("deletedBy") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_threads" ADD CONSTRAINT "FK_970d21ba5e546f3f36970ceff09" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_threads" ADD CONSTRAINT "FK_98ca905711f876f0894ad0cae72" FOREIGN KEY ("branch_id") REFERENCES "client_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_threads" ADD CONSTRAINT "FK_a9162193af4e3918c2831c84eb2" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_threads" ADD CONSTRAINT "FK_9aa44d598d13064b34e0a358896" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_messages" ADD CONSTRAINT "FK_ad48e10b27dfd8a6014479f51ce" FOREIGN KEY ("thread_id") REFERENCES "notification_threads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_messages" ADD CONSTRAINT "FK_9d44e7334a8661e09a050d77170" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "compliance_tasks" ADD CONSTRAINT "FK_916c33b76ca0633d410d8540de3" FOREIGN KEY ("compliance_id") REFERENCES "compliance_master"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "compliance_tasks" ADD CONSTRAINT "FK_b4316bc66b02f8c072127d1cf0c" FOREIGN KEY ("branch_id") REFERENCES "client_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "compliance_tasks" ADD CONSTRAINT "FK_7534da8485485459de29124e3b8" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "compliance_tasks" ADD CONSTRAINT "FK_fb01ab15d221c93e29cc0d6024f" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_users" ADD CONSTRAINT "FK_3cd05fd13c044ffd22f5bf2ec1a" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_users" ADD CONSTRAINT "FK_d51f0c13ed457cabc2075a9bd7d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_contractors" ADD CONSTRAINT "FK_3e8c2fd4bfc49bcf3200523757c" FOREIGN KEY ("branchId") REFERENCES "client_branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_contractors" ADD CONSTRAINT "FK_55462579e792fdb18afece67437" FOREIGN KEY ("contractorUserId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audits" ADD CONSTRAINT "FK_e160a9217102a315d79d664f19f" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audits" ADD CONSTRAINT "FK_1b556b49efbcdca1b2215fd4820" FOREIGN KEY ("contractor_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audits" ADD CONSTRAINT "FK_7ad0c766d1c0da4a0d14ef3335d" FOREIGN KEY ("assigned_auditor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audits" ADD CONSTRAINT "FK_fc7f7c644d7c8e946144ea49777" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_assignments" ADD CONSTRAINT "FK_a85ca43f4a8604cc613777d1e4c" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_assignments" ADD CONSTRAINT "FK_8598d06df06180f40388cadbf64" FOREIGN KEY ("crm_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_assignments" ADD CONSTRAINT "FK_b3cb34759dfca6c5f9e7c169ac2" FOREIGN KEY ("auditor_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_branches" ADD CONSTRAINT "FK_a93a8dec13e6204974dd67386ed" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_branches" ADD CONSTRAINT "FK_7252d91dd610730c97d6b58ae79" FOREIGN KEY ("branch_id") REFERENCES "client_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_branches" DROP CONSTRAINT "FK_7252d91dd610730c97d6b58ae79"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_branches" DROP CONSTRAINT "FK_a93a8dec13e6204974dd67386ed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_assignments" DROP CONSTRAINT "FK_b3cb34759dfca6c5f9e7c169ac2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_assignments" DROP CONSTRAINT "FK_8598d06df06180f40388cadbf64"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_assignments" DROP CONSTRAINT "FK_a85ca43f4a8604cc613777d1e4c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audits" DROP CONSTRAINT "FK_fc7f7c644d7c8e946144ea49777"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audits" DROP CONSTRAINT "FK_7ad0c766d1c0da4a0d14ef3335d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audits" DROP CONSTRAINT "FK_1b556b49efbcdca1b2215fd4820"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audits" DROP CONSTRAINT "FK_e160a9217102a315d79d664f19f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_contractors" DROP CONSTRAINT "FK_55462579e792fdb18afece67437"`,
    );
    await queryRunner.query(
      `ALTER TABLE "branch_contractors" DROP CONSTRAINT "FK_3e8c2fd4bfc49bcf3200523757c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_users" DROP CONSTRAINT "FK_d51f0c13ed457cabc2075a9bd7d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "client_users" DROP CONSTRAINT "FK_3cd05fd13c044ffd22f5bf2ec1a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "compliance_tasks" DROP CONSTRAINT "FK_fb01ab15d221c93e29cc0d6024f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "compliance_tasks" DROP CONSTRAINT "FK_7534da8485485459de29124e3b8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "compliance_tasks" DROP CONSTRAINT "FK_b4316bc66b02f8c072127d1cf0c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "compliance_tasks" DROP CONSTRAINT "FK_916c33b76ca0633d410d8540de3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_messages" DROP CONSTRAINT "FK_9d44e7334a8661e09a050d77170"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_messages" DROP CONSTRAINT "FK_ad48e10b27dfd8a6014479f51ce"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_threads" DROP CONSTRAINT "FK_9aa44d598d13064b34e0a358896"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_threads" DROP CONSTRAINT "FK_a9162193af4e3918c2831c84eb2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_threads" DROP CONSTRAINT "FK_98ca905711f876f0894ad0cae72"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification_threads" DROP CONSTRAINT "FK_970d21ba5e546f3f36970ceff09"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deletion_audit" DROP CONSTRAINT "FK_f8c95bbea64e5b3dfd3bb2fcbfd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deletion_audit" DROP CONSTRAINT "FK_cadefdd74d86bd13aa501bf6b2d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "approvals" DROP CONSTRAINT "FK_2a8561ab7c1f4a93bab57275799"`,
    );
    await queryRunner.query(
      `ALTER TABLE "approvals" DROP CONSTRAINT "FK_f4e55f0bc92584dce72797c5078"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7252d91dd610730c97d6b58ae7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a93a8dec13e6204974dd67386e"`,
    );
    await queryRunner.query(`DROP TABLE "user_branches"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_eaffd500b8c44132c3b81b3461"`,
    );
    await queryRunner.query(`DROP TABLE "client_assignments_current"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_CLIENT_ASSIGNMENTS_CLIENT_UNIQUE"`,
    );
    await queryRunner.query(`DROP TABLE "client_assignments"`);
    await queryRunner.query(
      `DROP TYPE "public"."client_assignments_status_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_11240c7d0820da9b5433efc68c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_25d6aed6c8497f4a3dc60962fe"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_979cc6333d461a19a5b36f05ec"`,
    );
    await queryRunner.query(`DROP TABLE "client_assignment_history"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_36518b7c1639d41fe74154a7e4"`,
    );
    await queryRunner.query(`DROP TABLE "client_auditor_assignments"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bedc56c00588ea998332eb9127"`,
    );
    await queryRunner.query(`DROP TABLE "client_crm_assignments"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_13c69424c440a0e765053feb4b"`,
    );
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TABLE "audits"`);
    await queryRunner.query(`DROP TYPE "public"."audits_audit_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."audits_frequency_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_BRANCH_CONTRACTORS_UNIQUE"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_BRANCH_CONTRACTORS_CONTRACTOR"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_BRANCH_CONTRACTORS_CLIENTID"`,
    );
    await queryRunner.query(`DROP TABLE "branch_contractors"`);
    await queryRunner.query(`DROP TABLE "branch_compliances"`);
    await queryRunner.query(
      `DROP TYPE "public"."branch_compliances_status_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_CLIENT_USERS_USERID_UNIQUE"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_CLIENT_USERS_CLIENTID"`);
    await queryRunner.query(`DROP TABLE "client_users"`);
    await queryRunner.query(`DROP TABLE "compliance_evidence"`);
    await queryRunner.query(`DROP TABLE "compliance_comments"`);
    await queryRunner.query(`DROP TABLE "compliance_tasks"`);
    await queryRunner.query(`DROP TABLE "compliance_applicability"`);
    await queryRunner.query(
      `DROP TYPE "public"."compliance_applicability_defaultownerrole_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."compliance_applicability_branchtype_enum"`,
    );
    await queryRunner.query(`DROP TABLE "compliance_master"`);
    await queryRunner.query(
      `DROP TYPE "public"."compliance_master_frequency_enum"`,
    );
    await queryRunner.query(`DROP TABLE "notification_messages"`);
    await queryRunner.query(`DROP TABLE "notification_threads"`);
    await queryRunner.query(`DROP TABLE "clients"`);
    await queryRunner.query(`DROP TABLE "deletion_requests"`);
    await queryRunner.query(`DROP TABLE "deletion_audit"`);
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TABLE "approvals"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_USERS_CLIENTID"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_USERS_MOBILE"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_USERS_ROLEID"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_BRANCHES_CLIENTID"`);
    await queryRunner.query(`DROP TABLE "client_branches"`);
    await queryRunner.query(
      `DROP TYPE "public"."client_branches_branchtype_enum"`,
    );
  }
}
