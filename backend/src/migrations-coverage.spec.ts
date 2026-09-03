import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Every new migration has to say how it reaches production.
 *
 * There are two ways a schema change actually gets applied here, and the
 * difference is invisible in a diff:
 *
 *  1. A boot patch in main.ts — runs on every backend start, so it self-applies
 *     on deploy.
 *  2. `backend/migrations/*.sql` — applied ONLY by a runner someone invokes.
 *     The deploy job (apply-service-entitlements-migrations.mjs) runs a
 *     HARDCODED filename list; it uses readdir merely to check which listed
 *     files are present, and never discovers new ones. `npm run db:migrate:sql`
 *     scans the directory, but nothing in CI calls it.
 *
 * So dropping a .sql file into migrations/ and merging it does nothing at all,
 * silently. That is exactly how `20260903_facedesk_admin_pin_hash.sql` shipped
 * while production kept `admin_pin varchar(12)` and every device provisioning
 * attempt failed on Postgres 22001 — code and schema deployed from the same
 * commit, disagreeing.
 *
 * This test makes that a review-time failure instead of a production one. It
 * does not care WHICH mechanism a migration uses, only that somebody chose one
 * on purpose and wrote it down.
 */

/**
 * Files dated before this were already applied by whatever means, long before
 * the guard existed; enumerating ~190 of them would be noise nobody maintains.
 * A date cutoff grandfathers history and still catches everything new, without
 * a list that rots.
 */
const GUARD_FROM = '20260901';

/**
 * Post-cutoff migrations that deliberately do NOT go in the deploy job's list,
 * with the reason. Add an entry here only alongside the mechanism that really
 * applies the change.
 */
const APPLIED_ANOTHER_WAY: Record<string, string> = {
  '20260903_facedesk_admin_pin_hash.sql':
    'Boot patch in main.ts widens facedesk_kiosk_devices.admin_pin to varchar(72). ' +
    'That table is patched nowhere else, so the file alone would never have applied.',
  '20260903_facedesk_identification_mode_no_reset.sql':
    'Documentation only — every statement is commented out. It records the removal ' +
    'of the boot-time UPDATE that reset identification_mode, and the manual ' +
    'follow-up for clients forced back to PIN_THEN_FACE.',
};

/** Mirrors the runner's own filter, so this test sees what it sees. */
const MIGRATION_FILE = /^(\d{8}[a-z]?|025)_.*\.sql$/;

describe('migration coverage', () => {
  const migrationsDir = join(__dirname, '..', 'migrations');
  const deployScript = join(
    __dirname,
    '..',
    'scripts',
    'apply-service-entitlements-migrations.mjs',
  );

  const onDisk = readdirSync(migrationsDir).filter((f) =>
    MIGRATION_FILE.test(f),
  );

  const deployList = new Set(
    (readFileSync(deployScript, 'utf8').match(/'[^']+\.sql'/g) ?? []).map((q) =>
      q.slice(1, -1),
    ),
  );

  it('finds the migrations directory and the deploy list', () => {
    // Guards the guard: a rename upstream would otherwise turn every assertion
    // below into a silent pass over an empty set.
    expect(onDisk.length).toBeGreaterThan(0);
    expect(deployList.size).toBeGreaterThan(0);
  });

  it('accounts for every migration added since the guard', () => {
    const unaccounted = onDisk
      .filter((f) => f.slice(0, 8) >= GUARD_FROM)
      .filter((f) => !deployList.has(f))
      .filter((f) => !(f in APPLIED_ANOTHER_WAY));

    expect(unaccounted).toEqual([]);
  });

  it('does not carry stale exemptions', () => {
    // An exemption for a file that no longer exists is a claim nobody can
    // check, and it hides the next one.
    const missing = Object.keys(APPLIED_ANOTHER_WAY).filter(
      (f) => !onDisk.includes(f),
    );
    expect(missing).toEqual([]);
  });

  it('does not exempt a file the deploy job already applies', () => {
    // Both would "work", but the file would then have two owners and the
    // written reason would be false.
    const both = Object.keys(APPLIED_ANOTHER_WAY).filter((f) =>
      deployList.has(f),
    );
    expect(both).toEqual([]);
  });
});
