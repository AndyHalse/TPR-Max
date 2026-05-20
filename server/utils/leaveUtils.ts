export interface LeaveRequest {
  id: string;
  daysTaken: number;
  status: string;
  startDate: string | Date;
  endDate: string | Date;
  leaveType: string;
}

export interface LeaveYear {
  start: Date;
  end: Date;
}

// UK England & Wales bank holidays. Update annually.
// Source: gov.uk/bank-holidays
export const UK_BANK_HOLIDAYS: string[] = [
  // 2025
  '2025-01-01', '2025-04-18', '2025-04-21', '2025-05-05', '2025-05-26',
  '2025-08-25', '2025-12-25', '2025-12-26',
  // 2026
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25',
  '2026-08-31', '2026-12-25', '2026-12-28',
  // 2027
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31',
  '2027-08-30', '2027-12-27', '2027-12-28',
];

const BANK_HOLIDAY_SET = new Set(UK_BANK_HOLIDAYS);

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isUkBankHoliday(date: Date | string): boolean {
  const s = typeof date === 'string' ? date.slice(0, 10) : ymd(date);
  return BANK_HOLIDAY_SET.has(s);
}

export function bankHolidaysInRange(startDate: Date | string, endDate: Date | string): string[] {
  const s = typeof startDate === 'string' ? startDate.slice(0, 10) : ymd(startDate);
  const e = typeof endDate === 'string' ? endDate.slice(0, 10) : ymd(endDate);
  return UK_BANK_HOLIDAYS.filter(h => h >= s && h <= e);
}

export function calculateWorkingDays(
  startDate: Date,
  endDate: Date,
  workingDaysPerWeek: number = 5,
  options: { halfDay?: 'none' | 'am' | 'pm'; excludeBankHolidays?: boolean } = {}
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const excludeBank = options.excludeBankHolidays !== false; // default true

  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const day = current.getDay();
    const isWeekend = day === 0 || day === 6;
    const isBank = excludeBank && BANK_HOLIDAY_SET.has(ymd(current));
    if (!isWeekend && !isBank) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  // Half-day only valid for single-day requests
  const sameDay = ymd(start) === ymd(end);
  if (sameDay && (options.halfDay === 'am' || options.halfDay === 'pm') && count === 1) {
    count = 0.5;
  }

  if (workingDaysPerWeek < 5 && workingDaysPerWeek > 0) {
    count = count * (workingDaysPerWeek / 5);
    count = Math.round(count * 2) / 2;
  }

  return count;
}

export function getLeaveYear(
  leaveYearStart: Date | null,
  referenceDate: Date = new Date()
): LeaveYear {
  if (!leaveYearStart) {
    const year = referenceDate.getFullYear();
    return {
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31),
    };
  }

  const refYear = referenceDate.getFullYear();
  let start = new Date(leaveYearStart);
  start.setFullYear(refYear);

  if (start > referenceDate) {
    start.setFullYear(refYear - 1);
  }

  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);

  return { start, end };
}

export function calculateLeaveBalance(
  entitlementDays: number,
  leaveYear: LeaveYear,
  approvedLeave: LeaveRequest[]
): {
  entitlement: number;
  taken: number;
  pending: number;
  remaining: number;
} {
  const yearStart = new Date(leaveYear.start);
  const yearEnd = new Date(leaveYear.end);

  const inYearLeave = approvedLeave.filter((req: any) => {
    const s = new Date(req.startDate ?? req.start_date);
    return s >= yearStart && s <= yearEnd;
  });

  // Accept both camelCase (Drizzle/TS) and snake_case (raw DB rows)
  const getType = (r: any) => r.leaveType ?? r.leave_type;
  const getDays = (r: any) => Number(r.daysTaken ?? r.days_taken ?? 0);

  const annualOnly = inYearLeave.filter(r => getType(r) === 'annual');

  const taken = annualOnly
    .filter((r) => r.status === 'approved')
    .reduce((sum, r) => sum + getDays(r), 0);

  const pending = annualOnly
    .filter((r) => r.status === 'pending')
    .reduce((sum, r) => sum + getDays(r), 0);

  return {
    entitlement: entitlementDays,
    taken: Math.round(taken * 2) / 2,
    pending: Math.round(pending * 2) / 2,
    remaining: Math.round((entitlementDays - taken) * 2) / 2,
  };
}
