import { RegisterLibraryService } from './register-library.service';
import { REGISTER_FORMS, REGISTER_SOURCES } from './register-catalogue';

describe('Register legal identity and jurisdiction isolation', () => {
  const library = new RegisterLibraryService();

  it('keeps all 36 states/UTs once, with Central separately', () => {
    const rows = library.jurisdictions();
    expect(rows).toHaveLength(37);
    expect(new Set(rows.map((r) => r.code)).size).toBe(37);
    expect(rows.filter((r) => r.name.includes('Dadra'))).toHaveLength(1);
  });

  it('does not substitute Central forms for a state with no reviewed forms', () => {
    expect(library.list('LD').forms).toEqual([]);
    expect(() => library.list('ALL')).toThrow();
    expect(() => library.list('UNKNOWN')).toThrow();
  });

  it('keeps same-number CLRA and OSH records separately searchable', () => {
    const twelves = library
      .list('CENTRAL', 'XII')
      .forms.filter((f) => f.formNumber === 'XII');
    expect(twelves).toHaveLength(2);
    expect(new Set(twelves.map((f) => f.id)).size).toBe(2);
    expect(twelves.map((f) => f.kind).sort()).toEqual(['NOTICE', 'REGISTER']);
    expect(twelves.map((f) => f.ruleReference).sort()).toEqual([
      'Rule 71',
      'Rule 74',
    ]);
  });

  it('never merges state records just because the layout is shared', () => {
    const ap = library.list('AP').forms;
    expect(ap.every((f) => f.jurisdiction === 'AP')).toBe(true);
    expect(ap.some((f) => f.rulesCode === 'AP_WAGES_2026')).toBe(true);
    expect(library.list('TS').forms.every((f) => f.sourceId === 'tsi')).toBe(
      true,
    );
  });

  it('keeps authority-owned and event records out of payroll generation', () => {
    const authorityForms = REGISTER_FORMS.filter(
      (f) => f.kind === 'AUTHORITY_REGISTER',
    );
    expect(authorityForms.length).toBeGreaterThan(0);
    expect(REGISTER_FORMS.every((f) => f.generation === 'REFERENCE_ONLY')).toBe(
      true,
    );
    expect(
      REGISTER_FORMS.every((f) => f.applicability === 'REVIEW_REQUIRED'),
    ).toBe(true);
  });

  it('has unique full legal identities and verifiable source provenance', () => {
    expect(new Set(REGISTER_FORMS.map((f) => f.id)).size).toBe(
      REGISTER_FORMS.length,
    );
    const identities = REGISTER_FORMS.map((f) =>
      [
        f.jurisdiction,
        f.actCode,
        f.rulesCode,
        f.formNumber,
        f.ruleReference,
        f.sourceId,
      ].join('|'),
    );
    expect(new Set(identities).size).toBe(REGISTER_FORMS.length);
    for (const f of REGISTER_FORMS) {
      expect(REGISTER_SOURCES[f.sourceId].url).toMatch(/^https:\/\//);
      if (f.sourceStatus === 'FINAL')
        expect(f.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('only downloads catalogue sources, rejecting arbitrary file paths', () => {
    expect(() => library.getSource('../../../../.env')).toThrow();
    const form = REGISTER_FORMS.find((f) => f.sourceId === 'cw')!;
    const source = library.getSource(form.id);
    expect(source.filePath).toMatch(/register-library[\\/]cw\.pdf$/);
    expect(source.fileName).toBe(form.id + '-prescribed-source.pdf');
  });
});
