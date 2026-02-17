import { Pipe, PipeTransform } from '@angular/core';

/**
 * Truncates a UUID to the first 8 characters for display.
 * Usage: {{ someUuid | shortId }}
 */
@Pipe({ name: 'shortId', standalone: true })
export class ShortIdPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    return value.length > 8 ? value.substring(0, 8) : value;
  }
}
