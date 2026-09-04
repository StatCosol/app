import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BackfillCodesDto } from './dto/contractor-employee.dto';

/**
 * This endpoint writes identifiers across a whole client's payroll records, so
 * a malformed body must be refused with a 400 rather than reaching the service.
 *
 * It previously took an inline `{ clientId?: string }` type, which erases to
 * `Object` in the emitted metadata — the global ValidationPipe skips those
 * entirely, so nothing was checked at all.
 */
describe('BackfillCodesDto', () => {
  const errorsFor = (payload: unknown) =>
    validateSync(plainToInstance(BackfillCodesDto, payload), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it('accepts a UUID clientId with a limit', () => {
    expect(
      errorsFor({
        clientId: '51936d06-168f-47d2-a12b-33e9306987e2',
        limit: 500,
      }),
    ).toHaveLength(0);
  });

  it('accepts an empty body — the caller may have its own client context', () => {
    expect(errorsFor({})).toHaveLength(0);
  });

  it('rejects a non-string clientId instead of throwing on .trim()', () => {
    // The regression: {"clientId": 123} reached .trim() and raised a
    // TypeError, so the caller got a 500 where 400 was intended.
    expect(errorsFor({ clientId: 123 })).not.toHaveLength(0);
    expect(errorsFor({ clientId: true })).not.toHaveLength(0);
    expect(errorsFor({ clientId: { a: 1 } })).not.toHaveLength(0);
    expect(errorsFor({ clientId: ['x'] })).not.toHaveLength(0);
  });

  it('rejects a clientId that is a string but not a UUID', () => {
    expect(errorsFor({ clientId: 'not-a-uuid' })).not.toHaveLength(0);
    expect(errorsFor({ clientId: '' })).not.toHaveLength(0);
  });

  it('rejects a non-numeric limit rather than passing NaN to the query', () => {
    // Math.min(Math.max('abc', 1), 1000) is NaN, which then reached a LIMIT.
    expect(errorsFor({ limit: 'abc' })).not.toHaveLength(0);
    expect(errorsFor({ limit: {} })).not.toHaveLength(0);
  });

  it('treats an explicit null as "not provided", which is safe', () => {
    // @IsOptional() skips null as well as undefined. That is correct here
    // rather than a hole: the handler reads `body?.limit ?? 200` and
    // `body?.clientId || user.clientId`, so null falls through to the default
    // and the caller's own context — never into a query.
    expect(errorsFor({ limit: null })).toHaveLength(0);
    expect(errorsFor({ clientId: null })).toHaveLength(0);

    const body: { limit?: number | null } = { limit: null };
    expect(body.limit ?? 200).toBe(200);
  });

  it('rejects a limit outside the range the service would clamp anyway', () => {
    expect(errorsFor({ limit: 0 })).not.toHaveLength(0);
    expect(errorsFor({ limit: -5 })).not.toHaveLength(0);
    expect(errorsFor({ limit: 5000 })).not.toHaveLength(0);
  });

  it('rejects an unknown key rather than ignoring it', () => {
    expect(errorsFor({ nonsense: 1 })).not.toHaveLength(0);
  });
});
