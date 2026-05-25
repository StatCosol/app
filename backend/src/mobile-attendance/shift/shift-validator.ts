import type { AttendanceShiftEntity } from '../entities/attendance-shift.entity';

export type ShiftMode = 'off' | 'warn' | 'enforce';

export function getShiftMode(): ShiftMode {
  const raw = (process.env.SHIFT_VALIDATION_MODE || 'off').toLowerCase();
  if (raw === 'warn' || raw === 'enforce') return raw;
  return 'off';
}

export interface ShiftValidationResult {
  hasShift: boolean;
  withinWindow: boolean;
  earlyByMin: number;
  lateByMin: number;
  otMinutes: number;
  reason?: string;
}

const IST_OFFSET_MIN = 330;

function minutesOfDayIst(ts: Date): number {
  const utcMin = ts.getUTCHours() * 60 + ts.getUTCMinutes();
  return (utcMin + IST_OFFSET_MIN) % (24 * 60);
}

function parseHhMm(value: string): number {
  const [h, m] = value.split(':');
  return Number(h) * 60 + Number(m);
}

const PASS_THROUGH: ShiftValidationResult = {
  hasShift: false,
  withinWindow: true,
  earlyByMin: 0,
  lateByMin: 0,
  otMinutes: 0,
};

export function validateAgainstShift(
  shift: AttendanceShiftEntity | null,
  direction: 'IN' | 'OUT' | 'AUTO',
  ts: Date,
): ShiftValidationResult {
  if (!shift) return PASS_THROUGH;

  const startMin = parseHhMm(shift.startTime);
  const endMin = parseHhMm(shift.endTime);
  // v1: overnight shifts (end <= start) are out of scope. Treat as
  // "no shift" so existing behaviour is preserved.
  if (endMin <= startMin) return PASS_THROUGH;

  const nowMin = minutesOfDayIst(ts);
  const earlyDiff = startMin - nowMin;
  const lateDiff = nowMin - endMin;

  let earlyByMin = 0;
  let lateByMin = 0;
  let otMinutes = 0;
  let reason: string | undefined;

  if (direction === 'IN' || direction === 'AUTO') {
    if (earlyDiff > shift.graceInMin) {
      earlyByMin = earlyDiff;
      reason = `Punch ${earlyDiff} min before shift start ${shift.startTime}`;
    }
  }

  if (direction === 'OUT' || direction === 'AUTO') {
    if (lateDiff > shift.graceOutMin) {
      lateByMin = lateDiff;
      if (lateDiff >= shift.otThresholdMin) otMinutes = lateDiff;
    }
  }

  return {
    hasShift: true,
    withinWindow: earlyByMin === 0,
    earlyByMin,
    lateByMin,
    otMinutes,
    reason,
  };
}
