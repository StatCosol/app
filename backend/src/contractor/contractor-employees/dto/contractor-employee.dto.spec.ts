import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateContractorEmployeeDto,
  UpdateContractorEmployeeDto,
} from './contractor-employee.dto';

/**
 * The global pipe runs whitelist + forbidNonWhitelisted, so a property the form
 * sends and the DTO does not declare is a flat 400 with nothing in the network
 * tab to say which one. Contractor employee registration failed that way while
 * bulk import kept working — the bulk endpoint takes a plain `{ rows: any[] }`
 * type rather than a DTO class, so class-validator never inspects it.
 *
 * This pins the contract from the form's side: every field the registration
 * screen posts must survive validation. Adding a field to the form without
 * adding it here should fail this test, not production.
 */
describe('CreateContractorEmployeeDto — accepts what the form sends', () => {
  // Exactly the payload built by contractor-employees-page.component.ts.
  const formPayload = {
    name: 'Test Worker',
    branchId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    gender: 'MALE',
    dateOfBirth: '1990-04-12',
    fatherName: 'Father Name',
    phone: '9000000000',
    email: 'worker@example.com',
    designation: 'Operator',
    department: 'Production',
    dateOfJoining: '2026-09-01',
    punchCode: 'P-1001',
    aadhaar: '123456789012',
    pan: 'ABCDE1234F',
    uan: '100200300400',
    esic: '31001234560000001',
    pfApplicable: true,
    esiApplicable: false,
  };

  const errorsFor = (cls: any, payload: Record<string, unknown>) =>
    validateSync(plainToInstance(cls, payload), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it('accepts the full registration payload', () => {
    const errors = errorsFor(CreateContractorEmployeeDto, formPayload);
    expect(errors.map((e) => `${e.property}: ${Object.keys(e.constraints ?? {})}`)).toEqual([]);
  });

  it('accepts the same payload on update', () => {
    const errors = errorsFor(UpdateContractorEmployeeDto, formPayload);
    expect(errors.map((e) => e.property)).toEqual([]);
  });

  it('uses esic, not esicNumber — the service maps property names onto columns', () => {
    const dto = plainToInstance(CreateContractorEmployeeDto, formPayload) as any;
    expect(dto.esic).toBe(formPayload.esic);
    expect(dto.esicNumber).toBeUndefined();
  });

  it('still rejects a genuinely unknown property', () => {
    const errors = errorsFor(CreateContractorEmployeeDto, {
      ...formPayload,
      notAColumn: 'x',
    });
    expect(errors.map((e) => e.property)).toContain('notAColumn');
  });

  it('still rejects values that would overflow their column', () => {
    const errors = errorsFor(CreateContractorEmployeeDto, {
      ...formPayload,
      gender: 'X'.repeat(11), // gender is varchar(10)
      fatherName: 'Y'.repeat(201), // father_name is varchar(200)
    });
    const failed = errors.map((e) => e.property);
    expect(failed).toContain('gender');
    expect(failed).toContain('fatherName');
  });

  it('name is still required', () => {
    const { name, ...withoutName } = formPayload;
    const errors = errorsFor(CreateContractorEmployeeDto, withoutName);
    expect(errors.map((e) => e.property)).toContain('name');
  });
});
