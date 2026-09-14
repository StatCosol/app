import { createHash } from 'crypto';
import { REGISTER_FORMS } from './register-catalogue';

export const legalRegisterType = (id: string) =>
  'LEGAL_' + createHash('sha256').update(id).digest('hex').slice(0, 32);

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
