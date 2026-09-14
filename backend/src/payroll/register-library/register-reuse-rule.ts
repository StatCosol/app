/** Only equivalences verified against final rules belong here. */
export function registerReuseRule(form: {
  sourceId: string;
  formNumber: string;
}) {
  const rules: Record<
    string,
    { sourceId: string; basis: string; forms: Record<string, string> }
  > = {
    osh: {
      sourceId: 'cw',
      basis: 'Central OSH Rules 2026, Rule 72(3)',
      forms: { XIII: 'I', XIV: 'IX', XV: 'IV', XVI: 'V' },
    },
    rjosh: {
      sourceId: 'rjw',
      basis: 'Rajasthan OSH Rules 2026, Rule 49(3)',
      forms: { '16': 'IV', '17': 'V', '18': 'I', '20': 'VII' },
    },
    brosh: {
      sourceId: 'brw',
      basis: 'Bihar OSH Rules 2026, Rule 27(2)',
      forms: { VIII: 'I', 'VIII(A)': 'IX', 'VIII(B)': 'IV', 'VIII(C)': 'V' },
    },
  };
  const rule = rules[form.sourceId];
  const sourceNumber = rule?.forms[form.formNumber];
  return sourceNumber
    ? { sourceId: rule.sourceId, sourceNumber, basis: rule.basis }
    : null;
}
