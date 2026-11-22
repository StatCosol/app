import { BadRequestException } from '@nestjs/common';

export function timeOfficeFilters(q: Record<string, string>) {
  if (Object.values(q).some((value) => typeof value !== 'string'))
    throw new BadRequestException('Filters must be single values');
  const date =
    q.date ||
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new BadRequestException('Choose a valid date');
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  });
  if (date > today)
    throw new BadRequestException('Future attendance cannot be reviewed');
  const hours = Number(q.hours ?? 9);
  const page = Number(q.page ?? 1);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24)
    throw new BadRequestException('Review hours must be between 0 and 24');
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
    throw new BadRequestException('Invalid page');
  if (
    q.branch &&
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(q.branch)
  )
    throw new BadRequestException('Invalid branch');
  const view = q.view || 'attendance';
  if (!['attendance', 'leaves', 'coff'].includes(view))
    throw new BadRequestException('Invalid view');
  const issue = q.issue || '';
  if (
    ![
      '',
      'NOT_MARKED',
      'SHORT_HOURS',
      'INCOMPLETE',
      'ABSENT',
      'ON_LEAVE',
    ].includes(issue)
  )
    throw new BadRequestException('Invalid attendance filter');
  return {
    date,
    hours,
    page,
    view,
    issue,
    branch: q.branch || null,
    search: (q.search || '').trim().slice(0, 100),
  };
}
