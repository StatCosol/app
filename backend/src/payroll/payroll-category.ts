import { BadRequestException } from '@nestjs/common';
import { PayrollComponentEntity } from './entities/payroll-component.entity';

export const PAYROLL_CATEGORIES = ['REGULAR', 'INTERN'] as const;
export type PayrollCategory = (typeof PAYROLL_CATEGORIES)[number];

export function payrollCategory(value?: string | null): PayrollCategory {
  return value === 'INTERN' ? 'INTERN' : 'REGULAR';
}

/** Intern earnings do not inherit a regular employee's salary structure. */
export function componentsForCategory(
  category: string | undefined,
  components: PayrollComponentEntity[],
): PayrollComponentEntity[] {
  if (category !== 'INTERN') return components;
  return [
    ...components.filter(
      (c) =>
        c.code !== 'STIPEND' &&
        (c.componentType !== 'EARNING' ||
          ['OTHER_EARNINGS', 'ARREAR_ATT_BONUS'].includes(c.code)),
    ),
    Object.assign(new PayrollComponentEntity(), {
      code: 'STIPEND',
      name: 'Stipend',
      componentType: 'EARNING',
      affectsPfWage: true,
      affectsEsiWage: true,
      isTaxable: true,
      isActive: true,
      displayOrder: 0,
    }),
  ];
}

export function internProrationFactor(
  payableDays: number,
  divisor: number,
  calendarDays: number,
): number {
  if (
    !Number.isFinite(payableDays) ||
    payableDays < 0 ||
    payableDays > calendarDays
  ) {
    throw new BadRequestException(
      'Intern payable days must be between zero and the days in the payroll month',
    );
  }
  // A full month's attendance cannot earn more than the monthly stipend.
  return Math.min(payableDays / divisor, 1);
}
