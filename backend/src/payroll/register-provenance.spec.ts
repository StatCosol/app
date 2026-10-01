import { RegistersRecordEntity } from './entities/registers-record.entity';
import { registerSourceType } from './register-provenance';

describe('Historical register source classification', () => {
  const row = (changes: Partial<RegistersRecordEntity> = {}) =>
    ({
      clientId: 'client-a',
      category: 'REGISTER',
      registerType: 'WAGE_REGISTER',
      payrollInputId: null,
      fileName: 'wages.xlsx',
      filePath: '/app/uploads/registers/client-a/wages.xlsx',
      ...changes,
    }) as RegistersRecordEntity;

  it.each([
    {},
    { filePath: 'uploads/registers/client-a/wages.xlsx' },
    { filePath: 'C:\\app\\uploads\\registers\\client-a\\wages.xlsx' },
    {
      category: 'RECORD',
      registerType: 'ECR',
      filePath: '/app/uploads/pf-ecr/123_wages.xlsx',
    },
    {
      category: 'RECORD',
      registerType: 'ESI',
      filePath: '/app/uploads/esi/123_wages.xlsx',
    },
    { filePath: '/elsewhere.xlsx', payrollInputId: 'input-a' },
    { filePath: '/elsewhere.xlsx', registerType: 'LEGAL_WAGES' },
  ])(
    'recognizes generator-owned storage or explicit provenance: %j',
    (changes) => {
      expect(registerSourceType(row(changes))).toBe('GENERATED');
    },
  );

  it.each([
    { filePath: '/app/uploads/registers-records/123_wages.xlsx' },
    { filePath: '/app/uploads/registers/client-b/wages.xlsx' },
    { filePath: '/app/uploads/registers/client-a/other.xlsx' },
    { filePath: '/app/myuploads/registers/client-a/wages.xlsx' },
    { category: 'RECORD' },
    {
      category: 'REGISTER',
      registerType: 'ECR',
      filePath: '/app/uploads/pf-ecr/123_wages.xlsx',
    },
    {
      category: 'RECORD',
      registerType: 'ECR',
      filePath: '/app/uploads/pf-ecr/manual_wages.xlsx',
    },
    {
      category: 'RECORD',
      registerType: 'ESI',
      filePath: '/app/uploads/pf-ecr/123_wages.xlsx',
    },
    {
      category: 'RECORD',
      registerType: 'ECR',
      filePath: '/app/uploads/pf-ecr/123_other.xlsx',
    },
    { fileName: '../wages.xlsx' },
    { fileName: '' },
    { filePath: '' },
    { registerType: null, filePath: '' },
  ])('keeps manual uploads and mismatched metadata manual: %j', (changes) => {
    expect(registerSourceType(row(changes))).toBe('MANUAL');
  });
});
