import dataSource from '../src/typeorm.datasource';

const seedSql = `
BEGIN;

-- Insert only if not already present (by complianceName + lawName)
INSERT INTO compliance_master (
  "complianceName",
  "lawName",
  "lawFamily",
  "stateScope",
  "minHeadcount",
  "maxHeadcount",
  "frequency",
  "description",
  "isActive"
)
SELECT * FROM (VALUES
  -- FACTORY ONLY
  ('Factories Act, 1948'::text, 'Factories Act, 1948'::text, 'FACTORY_ACT'::text, 'ALL'::text, NULL::int, NULL::int, 'YEARLY'::compliance_master_frequency_enum, 'Factory registration & ongoing compliance'::text, true),
  ('Code on OSH'::text, 'Code on Occupational Safety, Health & Working Conditions'::text, 'FACTORY_ACT'::text, 'ALL'::text, NULL::int, NULL::int, 'YEARLY'::compliance_master_frequency_enum, 'OSH compliance for establishments/factories as applicable'::text, true),

  -- SHOPS / ESTABLISHMENT ONLY
  ('Shops & Establishments Act'::text, 'Shops & Establishments Act'::text, 'SHOPS_ESTABLISHMENTS'::text, 'ALL'::text, NULL::int, NULL::int, 'YEARLY'::compliance_master_frequency_enum, 'S&E Act compliance for establishments/office branches'::text, true),

  -- LABOUR CODES (BOTH)
  ('Code on Wages'::text, 'Code on Wages'::text, 'LABOUR_CODE'::text, 'ALL'::text, NULL::int, NULL::int, 'MONTHLY'::compliance_master_frequency_enum, 'Wage compliance obligations'::text, true),
  ('Code on Social Security'::text, 'Code on Social Security'::text, 'LABOUR_CODE'::text, 'ALL'::text, NULL::int, NULL::int, 'MONTHLY'::compliance_master_frequency_enum, 'Social security obligations'::text, true),
  ('Code on Industrial Relations'::text, 'Code on Industrial Relations'::text, 'LABOUR_CODE'::text, 'ALL'::text, NULL::int, NULL::int, 'YEARLY'::compliance_master_frequency_enum, 'Industrial relations obligations'::text, true),

  -- STATE ACTS (BOTH, by state scope if you want)
  ('Professional Tax Act'::text, 'Professional Tax Act'::text, 'LABOUR_CODE'::text, 'TS,AP,KA,TN,MH,DL'::text, NULL::int, NULL::int, 'MONTHLY'::compliance_master_frequency_enum, 'State professional tax where applicable'::text, true),
  ('Labour Welfare Fund Act'::text, 'Labour Welfare Fund Act'::text, 'LABOUR_CODE'::text, 'TS,AP,KA,TN,MH,DL'::text, NULL::int, NULL::int, 'HALF_YEARLY'::compliance_master_frequency_enum, 'State LWF where applicable'::text, true),
  ('Employment Exchange Act'::text, 'Employment Exchange Act'::text, 'LABOUR_CODE'::text, 'ALL'::text, NULL::int, NULL::int, 'YEARLY'::compliance_master_frequency_enum, 'Employment exchange / notification requirements'::text, true)
) AS v(
  "complianceName","lawName","lawFamily","stateScope","minHeadcount","maxHeadcount","frequency","description","isActive"
)
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_master cm
  WHERE cm."complianceName" = v."complianceName"
    AND cm."lawName" = v."lawName"
);

COMMIT;

SELECT 'Seeded compliance_master' AS message;
`;

async function run() {
  const ds = dataSource;
  await ds.initialize();
  try {
    await ds.query(seedSql);
    console.log('Seeded compliance_master');
  } finally {
    await ds.destroy();
  }
}

run().catch((err) => {
  console.error('Seeding failed', err);
  process.exit(1);
});
