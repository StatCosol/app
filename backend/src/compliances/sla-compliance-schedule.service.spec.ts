import { SlaComplianceScheduleService } from './sla-compliance-schedule.service';
import type { ApplicableRule } from './sla-compliance-resolver.service';

/**
 * SlaComplianceScheduleService tests — turns applicable compliance rules into
 * concrete dated schedule entries for a month. Date/window resolution is where
 * off-by-one bugs hide, so the mapping is pinned down.
 */
const AR = (
  item: Record<string, unknown>,
  rule: Record<string, unknown>,
): ApplicableRule => ({ item, rule }) as unknown as ApplicableRule;

const item = (over: Record<string, unknown> = {}) => ({
  code: 'C1',
  name: 'Item 1',
  module: 'PF',
  frequency: 'MONTHLY',
  defaultPriority: 'MEDIUM',
  ...over,
});

describe('SlaComplianceScheduleService.buildMonthSchedule', () => {
  let svc: SlaComplianceScheduleService;
  beforeEach(() => {
    svc = new SlaComplianceScheduleService();
  });

  const build = (applicable: ApplicableRule[], month = '2026-05') =>
    svc.buildMonthSchedule({ applicable, month });

  it('resolves a window-based item to open/close dates', () => {
    const [e] = build([
      AR(item({ defaultPriority: 'HIGH' }), {
        id: 'r1',
        windowOpenDay: 1,
        windowCloseDay: 10,
      }),
    ]);
    expect(e.windowOpen).toBe('2026-05-01');
    expect(e.windowClose).toBe('2026-05-10');
    expect(e.priority).toBe('HIGH');
    expect(e.dueDate).toBeUndefined();
  });

  it('resolves a MONTHLY due-day to a due date', () => {
    const [e] = build([AR(item(), { id: 'r2', dueDay: 20 })]);
    expect(e.dueDate).toBe('2026-05-20');
  });

  it('shifts the month by dueMonthOffset', () => {
    const [e] = build([AR(item(), { id: 'r3', dueDay: 7, dueMonthOffset: 1 })]);
    expect(e.dueDate).toBe('2026-06-07');
  });

  it('includes a HALF_YEARLY item only when its due month matches', () => {
    const inMay = build([
      AR(item({ frequency: 'HALF_YEARLY' }), {
        id: 'r4',
        dueMonth: 5,
        dueDay: 15,
      }),
    ]);
    expect(inMay).toHaveLength(1);
    expect(inMay[0].dueDate).toBe('2026-05-15');

    const inNov = build([
      AR(item({ frequency: 'HALF_YEARLY' }), {
        id: 'r5',
        dueMonth: 11,
        dueDay: 15,
      }),
    ]);
    expect(inNov).toHaveLength(0);
  });

  it('defaults priority to MEDIUM when neither rule nor item specify it', () => {
    const [e] = build([
      AR(item({ defaultPriority: undefined }), { id: 'r6', dueDay: 5 }),
    ]);
    expect(e.priority).toBe('MEDIUM');
  });

  it('sorts entries by due date ascending', () => {
    const out = build([
      AR(item({ code: 'LATE' }), { id: 'a', dueDay: 25 }),
      AR(item({ code: 'EARLY' }), { id: 'b', dueDay: 5 }),
    ]);
    expect(out.map((e) => e.code)).toEqual(['EARLY', 'LATE']);
  });
});
