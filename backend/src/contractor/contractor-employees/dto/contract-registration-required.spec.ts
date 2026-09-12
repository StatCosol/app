import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateContractorEmployeeDto,
  UpdateContractorEmployeeDto,
} from './contractor-employee.dto';
import { BulkContractorEmployeeRowDto } from './contractor-employee-bulk.dto';

const valid = {
  name: 'Synthetic Worker',
  aadhaar: '123456789012',
  pan: 'ABCDE1234F',
  bankAccount: '001234567890',
};
for (const dto of [CreateContractorEmployeeDto, BulkContractorEmployeeRowDto]) {
  describe(`${dto.name} required registration details`, () => {
    const errors = (data: object) =>
      validateSync(
        plainToInstance<
          CreateContractorEmployeeDto | BulkContractorEmployeeRowDto,
          object
        >(dto, data),
      ).map((e) => e.property);
    for (const field of ['aadhaar', 'pan', 'bankAccount']) {
      it.each([undefined, null, '', '   '])(
        `rejects missing ${field}: %s`,
        (value) => {
          expect(errors({ ...valid, [field]: value })).toContain(field);
        },
      );
    }
    it.each([
      ['aadhaar', '123'],
      ['pan', '1234567890'],
      ['bankAccount', 'ABC123'],
      ['bankAccount', 1234567890],
      ['bankAccount', '1'.repeat(41)],
    ])('rejects malformed %s', (field, value) => {
      expect(errors({ ...valid, [field]: value })).toContain(field);
    });
    it('normalizes formatted identifiers and preserves account leading zeros', () => {
      const result = plainToInstance<
        CreateContractorEmployeeDto | BulkContractorEmployeeRowDto,
        object
      >(dto, {
        ...valid,
        aadhaar: '1234 5678 9012',
        pan: 'abcde1234f',
        bankAccount: '00 1234567890',
      });
      expect(validateSync(result)).toHaveLength(0);
      expect(result.aadhaar).toBe(valid.aadhaar);
      expect(result.pan).toBe(valid.pan);
      expect(result.bankAccount).toBe(valid.bankAccount);
    });
  });
}
it('allows an unrelated edit to an existing employee without inventing missing identity details', () => {
  expect(
    validateSync(
      plainToInstance(UpdateContractorEmployeeDto, { name: 'Updated name' }),
    ),
  ).toHaveLength(0);
});

describe('contract employee identity updates', () => {
  it.each([
    ['aadhaar', 'abc'],
    ['aadhaar', ''],
    ['pan', '123'],
    ['pan', '   '],
  ])('rejects malformed supplied %s', (field, value) => {
    const errors = validateSync(
      plainToInstance(UpdateContractorEmployeeDto, { [field]: value }),
    );
    expect(errors.map((e) => e.property)).toContain(field);
  });
  it('normalizes supplied fields while keeping omitted legacy values optional', () => {
    const value = plainToInstance(UpdateContractorEmployeeDto, {
      aadhaar: '1234 5678 9012',
      pan: 'abcde1234f',
      bankAccount: '00 1234567890',
    });
    expect(validateSync(value)).toHaveLength(0);
    expect(value.aadhaar).toBe('123456789012');
    expect(value.pan).toBe('ABCDE1234F');
    expect(value.bankAccount).toBe('001234567890');
    expect(
      validateSync(plainToInstance(UpdateContractorEmployeeDto, {})),
    ).toHaveLength(0);
  });
});
