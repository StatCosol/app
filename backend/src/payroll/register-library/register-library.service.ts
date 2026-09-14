import { registerLayout } from './register-layouts';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { REGISTER_FORMS, REGISTER_SOURCES } from './register-catalogue';
import { REGISTER_JURISDICTIONS } from './register-jurisdictions';

@Injectable()
export class RegisterLibraryService {
  list(jurisdiction: string, query = '') {
    const code = jurisdiction.trim().toUpperCase();
    if (
      code !== 'CENTRAL' &&
      !REGISTER_JURISDICTIONS.some((j) => j.code === code)
    ) {
      throw new BadRequestException(
        'Select a recognised state, union territory or Central jurisdiction',
      );
    }
    const search = query.trim().toLowerCase().slice(0, 200);
    const forms = REGISTER_FORMS.filter(
      (f) =>
        f.jurisdiction === code &&
        (!search ||
          [f.title, f.formNumber, f.actCode, f.rulesCode, f.ruleReference]
            .join(' ')
            .toLowerCase()
            .includes(search)),
    ).map((f) => ({
      ...f,
      notes: [
        f.notes,
        registerLayout(f.sourceId, f.formNumber, f.actCode)
          ? f.sourceId === 'osh' &&
            ['XIII', 'XIV', 'XV', 'XVI'].includes(f.formNumber)
            ? 'Rule 72(3) recognises required Code on Wages registers and wage slips. Review existing Wages records before preparing duplicate OSH records; this does not establish applicability by itself.'
            : 'Prepare from verified supporting records; complete missing particulars and obtain statutory review and authentication.'
          : '',
      ]
        .filter(Boolean)
        .join(' '),
      generation: registerLayout(f.sourceId, f.formNumber, f.actCode)
        ? 'MANUAL_PREPARATION'
        : 'REFERENCE_ONLY',
      preparationAvailable: !!registerLayout(
        f.sourceId,
        f.formNumber,
        f.actCode,
      ),
      usage:
        registerLayout(f.sourceId, f.formNumber, f.actCode)?.baseFormNumber ===
        'MATERNITY'
          ? 'Women employee and maternity records'
          : registerLayout(f.sourceId, f.formNumber, f.actCode)
                ?.baseFormNumber === 'EVENT'
            ? 'Incident/report evidence'
            : registerLayout(f.sourceId, f.formNumber, f.actCode)
                  ?.baseFormNumber === 'LEAVE'
              ? 'Leave records'
              : f.kind === 'AUTHORITY_REGISTER'
                ? 'Authority maintained'
                : registerLayout(f.sourceId, f.formNumber, f.actCode)
                      ?.baseFormNumber === 'IX'
                  ? 'Daily attendance'
                  : registerLayout(f.sourceId, f.formNumber, f.actCode)
                        ?.baseFormNumber === 'I'
                    ? 'Employee master'
                    : registerLayout(f.sourceId, f.formNumber, f.actCode)
                          ?.payrollPrefill
                      ? 'Monthly payroll'
                      : f.kind,
      source: REGISTER_SOURCES[f.sourceId],
      sourceDownloadAvailable: fs.existsSync(this.sourcePath(f.sourceId)),
    }));
    return {
      reviewedOn: '2026-09-14',
      jurisdiction:
        code === 'CENTRAL'
          ? {
              code,
              name: 'Central jurisdiction',
              coverage: 'PARTIAL',
              note: 'Central rules apply by appropriate-government jurisdiction, not automatically to every establishment in a state.',
            }
          : REGISTER_JURISDICTIONS.find((j) => j.code === code),
      forms,
    };
  }

  jurisdictions() {
    return [
      { code: 'CENTRAL', name: 'Central jurisdiction' },
      ...REGISTER_JURISDICTIONS,
    ];
  }

  getSource(id: string) {
    const form = REGISTER_FORMS.find((f) => f.id === id);
    if (!form) throw new NotFoundException('Register format not found');
    const filePath = this.sourcePath(form.sourceId);
    if (!fs.existsSync(filePath))
      throw new NotFoundException(
        'Local source unavailable; open the published source link',
      );
    return { filePath, fileName: form.id + '-prescribed-source.pdf' };
  }

  private sourcePath(sourceId: string) {
    // Only catalogue keys reach this method, never a request-supplied path.
    const compiled = path.resolve(
      __dirname,
      '../../../..',
      'assets/register-library',
      sourceId + '.pdf',
    );
    const development = path.resolve(
      __dirname,
      '../../..',
      'assets/register-library',
      sourceId + '.pdf',
    );
    return fs.existsSync(compiled) ? compiled : development;
  }
}
