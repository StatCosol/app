import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContractorMcdComputation1788742000000 implements MigrationInterface {
  name = 'ContractorMcdComputation1788742000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contractor_quotation_wages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        branch_id uuid NULL REFERENCES client_branches(id) ON DELETE CASCADE,
        contractor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        skill_category varchar(20) NOT NULL,
        daily_wage numeric(12,2) NOT NULL,
        monthly_wage numeric(12,2) NULL,
        effective_from date NOT NULL,
        effective_to date NULL,
        source varchar(255) NULL,
        notes text NULL,
        created_by_user_id uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_contractor_quotation_wage_key
      ON contractor_quotation_wages (
        client_id,
        contractor_user_id,
        COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
        skill_category,
        effective_from
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_cqw_client_contractor ON contractor_quotation_wages(client_id, contractor_user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_cqw_branch ON contractor_quotation_wages(branch_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contractor_mcd_uploads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        branch_id uuid NULL REFERENCES client_branches(id) ON DELETE SET NULL,
        contractor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        period_month varchar(7) NOT NULL,
        file_name varchar(255) NULL,
        uploaded_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        status varchar(20) NOT NULL DEFAULT 'COMPLIANT',
        total_rows int NOT NULL DEFAULT 0,
        matched_rows int NOT NULL DEFAULT 0,
        mismatch_rows int NOT NULL DEFAULT 0,
        error_rows int NOT NULL DEFAULT 0,
        notification_id uuid NULL REFERENCES notifications(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_mcd_upload_client_contractor ON contractor_mcd_uploads(client_id, contractor_user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_mcd_upload_period ON contractor_mcd_uploads(period_month)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contractor_mcd_rows (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        upload_id uuid NOT NULL REFERENCES contractor_mcd_uploads(id) ON DELETE CASCADE,
        row_number int NOT NULL,
        employee_code varchar(80) NULL,
        employee_name varchar(255) NOT NULL,
        skill_category varchar(20) NOT NULL,
        days_worked numeric(8,2) NOT NULL,
        mcd_daily_wage numeric(12,2) NULL,
        quotation_daily_wage numeric(12,2) NULL,
        expected_basic_wage numeric(12,2) NOT NULL DEFAULT 0,
        reported_basic_wage numeric(12,2) NULL,
        other_earnings numeric(12,2) NOT NULL DEFAULT 0,
        computed_gross numeric(12,2) NOT NULL DEFAULT 0,
        reported_gross numeric(12,2) NULL,
        pf_deduction numeric(12,2) NOT NULL DEFAULT 0,
        esi_deduction numeric(12,2) NOT NULL DEFAULT 0,
        pt_deduction numeric(12,2) NOT NULL DEFAULT 0,
        other_deductions numeric(12,2) NOT NULL DEFAULT 0,
        net_salary numeric(12,2) NOT NULL DEFAULT 0,
        match_status varchar(30) NOT NULL,
        mismatch_reason text NULL,
        raw_data jsonb NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_mcd_row_upload ON contractor_mcd_rows(upload_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_mcd_row_status ON contractor_mcd_rows(match_status)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS contractor_mcd_rows`);
    await queryRunner.query(`DROP TABLE IF EXISTS contractor_mcd_uploads`);
    await queryRunner.query(`DROP TABLE IF EXISTS contractor_quotation_wages`);
  }
}
