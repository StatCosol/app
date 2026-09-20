import { BadRequestException, PipeTransform } from '@nestjs/common';

/**
 * A path id that reaches an integer/bigint column, validated without changing
 * the handler's type: these routes pass the raw string to their service, and a
 * non-numeric one reached Postgres and came back as a 500 "database error"
 * (invalid input syntax for type integer: "NaN"). Now a 400.
 */
export class NumericIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^\d+$/.test(String(value ?? '').trim()))
      throw new BadRequestException('Invalid id');
    return String(value).trim();
  }
}
