import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { getMetadataStorage } from 'class-validator';
import { defaultMetadataStorage } from 'class-transformer/cjs/storage';
import { createGlobalValidationPipe } from './global-validation-pipe';

/**
 * Every validated array of OBJECTS needs an @Type() naming its element.
 *
 * The global pipe converts implicitly, and TypeScript emits a bare `Array` as
 * the design type of any array property, so without @Type each object element
 * is converted to `Array` as well: `[{ name: 'A' }]` reaches the controller as
 * `[[]]`. Nothing errors. The contractor bulk upload rejected every request
 * for ten days because of it, and four nomination DTOs have been storing
 * nominations with no nominees since May — see global-validation-pipe.ts.
 *
 * Arrays of primitives are unaffected (only object elements are converted),
 * and the emitted metadata cannot tell `string[]` from `Foo[]`, so the element
 * type is read from each property's declaration in its class body.
 */
const SRC = path.resolve(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory())
      return e.name === 'node_modules' ? [] : sourceFiles(full);
    return e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') ? [full] : [];
  });
}

/**
 * Type aliases that resolve to string unions. The spec reads source text, not
 * types, so these are named here. Add one only after checking its definition.
 */
const STRING_ALIASES = [
  'ServiceModuleCode', // service-entitlements.constants.ts: (typeof SERVICE_MODULE_CODES)[number]
];

const PRIMITIVE_ELEMENT = [
  new RegExp(`^(${STRING_ALIASES.join('|')})\\[\\]$`),
  /^(string|number|boolean|Date)\[\]$/,
  /^Array<(string|number|boolean|Date)>$/,
  /^\((?:\s*(?:'[^']*'|"[^"]*"|string|number)\s*\|?)+\)\[\]$/, // ('A' | 'B')[]
];

function isPrimitiveArray(declared: string): boolean {
  const t = declared
    .replace(/\s*\|\s*(null|undefined)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return PRIMITIVE_ELEMENT.some((re) => re.test(t));
}

/** The declared type of `prop` inside `class <name> { ... }`, if found. */
function declaredType(
  source: string,
  className: string,
  prop: string,
): string | null {
  const start = source.search(new RegExp(`\\bclass\\s+${className}\\b`));
  if (start < 0) return null;
  const next = source
    .slice(start + 1)
    .search(/\n(?:export\s+)?(?:abstract\s+)?class\s/);
  const body =
    next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
  const m = body.match(
    new RegExp(`\\b${prop}[?!]?\\s*:\\s*([^;=\\n]+?)\\s*[;=\\n]`),
  );
  return m ? m[1].trim() : null;
}

describe('DTO array element types (global pipe implicit conversion)', () => {
  const files = sourceFiles(SRC).filter((f) =>
    fs.readFileSync(f, 'utf8').includes("from 'class-validator'"),
  );
  const storage = getMetadataStorage();

  it('finds the validated classes to check', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('gives every array-of-objects property an @Type()', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      const mod = require(file) as Record<string, unknown>;
      for (const exported of Object.values(mod)) {
        if (typeof exported !== 'function' || !exported.prototype) continue;
        const cls = exported as new (...args: unknown[]) => object;
        const props = new Set(
          storage
            .getTargetValidationMetadatas(cls, '', true, false)
            .map((m) => m.propertyName),
        );
        for (const prop of props) {
          if (Reflect.getMetadata('design:type', cls.prototype, prop) !== Array)
            continue;
          if (defaultMetadataStorage.findTypeMetadata(cls, prop)) continue;
          const declared = declaredType(source, cls.name, prop);
          if (declared && isPrimitiveArray(declared)) continue;
          offenders.push(
            `${path.relative(SRC, file)} ${cls.name}.${prop}: ${declared ?? '(type not found in class body)'}`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the global pipe keeps array-of-object bodies intact', () => {
  const pipe = createGlobalValidationPipe();
  const run = (metatype: unknown, body: unknown) =>
    pipe.transform(JSON.parse(JSON.stringify(body)), {
      type: 'body',
      metatype: metatype as never,
      data: '',
    });

  it('passes contractor bulk rows through as objects', async () => {
    const { BulkCreateContractorEmployeesDto } =
      await import('../../contractor/contractor-employees/dto/contractor-employee-bulk.dto');
    const row = {
      name: 'Ravi',
      aadhaar: '123456789012',
      pan: 'ABCDE1234F',
      bankAccount: '001234567890',
      dailyWage: null,
    };
    const out = await run(BulkCreateContractorEmployeesDto, {
      branchId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      rows: [row],
    });
    expect(out.rows).toEqual([row]);
  });

  it.each([
    ['employees', 'CreateEmployeeNominationDto', { nominationType: 'PF' }],
    ['ess', 'CreateEssNominationDto', { nominationType: 'PF' }],
    ['ess', 'ResubmitNominationDto', {}],
    ['ess', 'UpdateEssNominationDto', {}],
  ])('passes %s %s nominees through as objects', async (mod, name, base) => {
    const dtos = (await import(
      mod === 'employees'
        ? '../../employees/dto/employees.dto'
        : '../../ess/dto/ess.dto'
    )) as Record<string, unknown>;
    // The edit screens send nominees back with their server-side keys.
    const member = {
      id: 'm-1',
      nominationId: 'n-1',
      memberName: 'Lakshmi',
      relationship: 'SPOUSE',
      sharePct: 100,
      isMinor: false,
    };
    const out = await run(dtos[name], { ...base, members: [member] });
    expect(out.members).toEqual([member]);
  });

  describe('appraisal cycle scopes', () => {
    const cycle = {
      cycleCode: 'APR-2026',
      cycleName: 'Annual Appraisal 2026',
      financialYear: '2026-2027',
      appraisalType: 'ANNUAL',
      reviewPeriodFrom: '2026-04-01',
      reviewPeriodTo: '2027-03-31',
    };
    const load = async () =>
      (await import('../../performance-appraisal/dto/appraisal-cycle.dto'))
        .CreateAppraisalCycleDto;

    it('keeps the branch a scope was limited to', async () => {
      const scope = {
        branchId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
        employmentType: 'PERMANENT',
      };
      const out = await run(await load(), { ...cycle, scopes: [scope] });
      expect(out.scopes).toHaveLength(1);
      expect({ ...out.scopes[0] }).toEqual(scope);
    });

    it('rejects a scope branch that is not a uuid', async () => {
      await expect(
        run(await load(), { ...cycle, scopes: [{ branchId: 'north' }] }),
      ).rejects.toThrow();
    });
  });
});
