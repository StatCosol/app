import { RegistersRecordEntity } from './entities/registers-record.entity';

// Manual uploads use uploads/registers-records. These directories are reserved
// for generators, including historical runs with no source_payroll_input_id.
const storage = "REPLACE(COALESCE(r.file_path,''),CHR(92),'/')";
const name = "COALESCE(r.file_name,'')";
const registerTail = `('uploads/registers/' || r.client_id::text || '/' || ${name})`;
const storedRegister = `(r.category = 'REGISTER' AND
  (${storage} = ${registerTail} OR RIGHT(${storage},LENGTH(${registerTail})+1) = '/' || ${registerTail}))`;
const storedExport = `(r.category = 'RECORD' AND
  ((r.register_type = 'ECR' AND ${storage} ~ '(^|/)uploads/pf-ecr/[0-9]+_[^/]+$') OR
   (r.register_type = 'ESI' AND ${storage} ~ '(^|/)uploads/esi/[0-9]+_[^/]+$')) AND
  RIGHT(${storage},LENGTH(${name})+1) = '_' || ${name})`;

export const GENERATED_REGISTER_SQL = `(r.payroll_input_id IS NOT NULL OR
  LEFT(COALESCE(r.register_type,''),6) = 'LEGAL_' OR COALESCE(
  (${name} <> '' AND POSITION('/' IN ${name}) = 0 AND POSITION(CHR(92) IN ${name}) = 0 AND
   (${storedRegister} OR ${storedExport})),false))`;

export function registerSourceType(
  row: RegistersRecordEntity,
): 'GENERATED' | 'MANUAL' {
  if (row.payrollInputId || row.registerType?.startsWith('LEGAL_'))
    return 'GENERATED';
  const fileName = row.fileName || '';
  if (!fileName || /[/\\]/.test(fileName)) return 'MANUAL';
  const filePath = (row.filePath || '').replace(/\\/g, '/');
  const tail = `uploads/registers/${row.clientId}/${fileName}`;
  if (
    row.category === 'REGISTER' &&
    (filePath === tail || filePath.endsWith('/' + tail))
  ) {
    return 'GENERATED';
  }
  const folder =
    row.registerType === 'ECR'
      ? 'pf-ecr'
      : row.registerType === 'ESI'
        ? 'esi'
        : null;
  if (row.category === 'RECORD' && folder) {
    const generatedPrefix = filePath.slice(0, -(fileName.length + 1));
    if (
      filePath.endsWith('_' + fileName) &&
      new RegExp(`(^|/)uploads/${folder}/[0-9]+$`).test(generatedPrefix)
    )
      return 'GENERATED';
  }
  return 'MANUAL';
}
