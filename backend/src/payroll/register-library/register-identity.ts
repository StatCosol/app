import { createHash } from 'crypto';
import { REGISTER_FORMS } from './register-catalogue';
import { registerLayout } from './register-layouts';

export const legalRegisterType = (id: string) =>
  'LEGAL_' + createHash('sha256').update(id).digest('hex').slice(0, 32);

// Integrated forms contain wages even when their titles omit that word.
export const LEGAL_WAGE_REGISTER_TYPES = REGISTER_FORMS.filter((form) => {
  const layout = registerLayout(form.sourceId, form.formNumber, form.actCode);
  return (
    layout &&
    (layout.payrollPrefill ||
      layout.fields.some((field) => ['gross', 'net'].includes(field.key)))
  );
}).map((form) => legalRegisterType(form.id));

const identities = new Map(
  REGISTER_FORMS.map((form) => [legalRegisterType(form.id), form]),
);

export function registerIdentity(type?: string | null) {
  const form = identities.get(type || '');
  return form
    ? {
        formId: form.id,
        actCode: form.actCode,
        rulesCode: form.rulesCode,
        formNumber: form.formNumber,
        jurisdiction: form.jurisdiction,
        label:
          form.jurisdiction + ' · Form ' + form.formNumber + ' · ' + form.title,
      }
    : null;
}
