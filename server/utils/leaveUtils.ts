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

export function calculateWorkingDays(
  startDate: Date,
  endDate: Date,
  workingDaysPerWeek: number = 5
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
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

  const inYearLeave = approvedLeave.filter((req) => {
    const s = new Date(req.startDate);
    return s >= yearStart && s <= yearEnd;
  });

  const taken = inYearLeave
    .filter((r) => r.status === 'approved')
    .reduce((sum, r) => sum + Number(r.daysTaken), 0);

  const pending = inYearLeave
    .filter((r) => r.status === 'pending')
    .reduce((sum, r) => sum + Number(r.daysTaken), 0);

  return {
    entitlement: entitlementDays,
    taken: Math.round(taken * 2) / 2,
    pending: Math.round(pending * 2) / 2,
    remaining: Math.round((entitlementDays - taken) * 2) / 2,
  };
}
