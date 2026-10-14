import { BadRequestException } from '@nestjs/common';

export function validateInternshipPeriod(record: {
  payrollCategory?: string;
  internshipStartDate?: string | null;
  internshipEndDate?: string | null;
}): void {
  if (record.payrollCategory !== 'INTERN') return;
  const start = record.internshipStartDate;
  const end = record.internshipEndDate;
  if (
    !start ||
    !end ||
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    new Date(start).toISOString().slice(0, 10) !== start ||
    new Date(end).toISOString().slice(0, 10) !== end ||
    end < start
  ) {
    throw new BadRequestException(
      'Enter a valid internship start and end date; the end date must be on or after the start date',
    );
  }
}
