/**
 * One-time migration: seed March 2026 EL (Earned Leave) data from paysheet.
 *
 * For employees who did NOT join in March 2026:
 *   - EL_ACCRUAL ledger entry = workedDays / 20
 *   - EL_PAID_LEAVE ledger entry = sheet's "Paid Leave" value
 *   - leave_balances updated accordingly
 *
 * For employees who joined IN March 2026: skip (no EL).
 *
 * Usage: Run via POST /api/v1/payroll/admin/seed-march-el (ADMIN only)
 */

// Sheet data: empCode -> { workDays, paidLeave, payableDays }
// Extracted from "March 2026 paysheet updated_8th April.xlsx"
export const MARCH_2026_SHEET_DATA: Record<
  string,
  { workDays: number; paidLeave: number; payableDays: number }
> = {
  LMSBRM0011: { workDays: 26, paidLeave: 0, payableDays: 26 },
  LMSBRM0022: { workDays: 26, paidLeave: 0, payableDays: 26 },
  LMSBRM0025: { workDays: 26, paidLeave: 0, payableDays: 26 },
  LMSBRM0023: { workDays: 26, paidLeave: 0, payableDays: 26 },
  LMSBRM0018: { workDays: 24.5, paidLeave: 1.36, payableDays: 25.86 },
  LMSBRM0008: { workDays: 26, paidLeave: 0, payableDays: 26 },
  LMSBRM0020: { workDays: 26, paidLeave: 0, payableDays: 26 },
  LMSBRM0012: { workDays: 26, paidLeave: 0, payableDays: 26 },
  LMSBRM0013: { workDays: 26, paidLeave: 0, payableDays: 26 },
  LMSBRM0026: { workDays: 22, paidLeave: 1.25, payableDays: 23.25 },
  LMSBRM0015: { workDays: 0, paidLeave: 0, payableDays: 0 },
  LMSBRM0016: { workDays: 25, paidLeave: 1, payableDays: 26 },
  LMSBRM0017: { workDays: 21.5, paidLeave: 1.19, payableDays: 22.69 },
  LMSBRM0014: { workDays: 26, paidLeave: 0, payableDays: 26 },
  LMSBRM0009: { workDays: 26, paidLeave: 0, payableDays: 26 },
  LMSBRM0010: { workDays: 12, paidLeave: 0.7, payableDays: 12.7 },
  LMSBRM0028: { workDays: 26, paidLeave: 0, payableDays: 26 },
  LMSBRM0027: { workDays: 26, paidLeave: 0, payableDays: 26 },
  LMSBRM0024: { workDays: 26, paidLeave: 0, payableDays: 26 },
  LMSBRM0007: { workDays: 26, paidLeave: 0, payableDays: 26 },
  LMSBRM0006: { workDays: 25, paidLeave: 1, payableDays: 26 },
  LMSBRM0005: { workDays: 26, paidLeave: 0, payableDays: 26 },
  LMSBRM0004: { workDays: 15, paidLeave: 0.8, payableDays: 15.8 },
  LMSBRM0003: { workDays: 26, paidLeave: 0, payableDays: 26 },
  LMSBRM0002: { workDays: 26, paidLeave: 0, payableDays: 26 },
  LMSBRM0001: { workDays: 11, paidLeave: 0.6, payableDays: 11.6 },
  LMSBRM0030: { workDays: 24, paidLeave: 0, payableDays: 24 },
  LMSBRM0029: { workDays: 20, paidLeave: 0, payableDays: 20 },
  LMSBRM0031: { workDays: 18, paidLeave: 0, payableDays: 18 },
};
