import { ValidationPipe, ValidationPipeOptions } from '@nestjs/common';

/**
 * The options main.ts gives the global ValidationPipe, in one place so a spec
 * can build the same pipe instead of an approximation of it.
 *
 * `enableImplicitConversion` is the one to know about. class-transformer
 * converts each property to its emitted design type, and TypeScript emits a
 * bare `Array` for any array property — `Foo[]`, `any[]` and
 * `Record<string, unknown>[]` alike. Without an `@Type()` naming the element,
 * each ELEMENT is then converted to `Array` too, so `[{ name: 'A' }]` arrives
 * in the controller as `[[]]`. Every array-of-objects property on a DTO needs
 * `@Type(() => SomeClass)`, or `@Type(() => Object)` to take the objects as
 * sent. The DTO metadata spec fails the build on any that do not.
 *
 * The contractor bulk upload spec validated its DTO without this option,
 * passed, and the endpoint rejected every upload in production.
 */
export const GLOBAL_VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
};

export function createGlobalValidationPipe(): ValidationPipe {
  return new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
}
