import { describe, test, expect } from 'vitest';
import { calculateBradfordFactor } from './bradfordFactor';
import { calculateWorkingDays, calculateLeaveBalance } from './leaveUtils';

// ─── Bradford Factor ──────────────────────────────────────────────────────────

describe('calculateBradfordFactor', () => {
  test('returns zero score for empty absences', () => {
    const result = calculateBradfordFactor([]);
    expect(result.score).toBe(0);
    expect(result.rating).toBe('low');
  });

  test('calculates correctly with snake_case DB rows', () => {
    const absences = [
      { start_date: new Date().toISOString(), days_lost: 3 },
      { start_date: new Date().toISOString(), days_lost: 2 },
    ];
    const result = calculateBradfordFactor(absences as any);
    // 2 spells × 2 spells × 5 days = 20
    expect(result.spells).toBe(2);
    expect(result.totalDays).toBe(5);
    expect(result.score).toBe(20);
  });

  test('filters out absences older than rolling window', () => {
    const old = new Date();
    old.setFullYear(old.getFullYear() - 2);
    const absences = [{ start_date: old.toISOString(), days_lost: 10 }];
    const result = calculateBradfordFactor(absences as any);
    expect(result.spells).toBe(0);
    expect(result.score).toBe(0);
  });

  test('rates correctly: medium at 50, high at 200, critical at 450', () => {
    // makeAbsences(count, daysPerAbsence): totalDays = count × daysPerAbsence
    // score = spells² × totalDays
    const makeAbsences = (count: number, days: number) =>
      Array.from({ length: count }, () => ({
        start_date: new Date().toISOString(),
        days_lost: days,
      }));
    // 3² × (3×2)=6 = 54 → medium
    expect(calculateBradfordFactor(makeAbsences(3, 2) as any).rating).toBe('medium');
    // 5² × (5×2)=10 = 250 → high
    expect(calculateBradfordFactor(makeAbsences(5, 2) as any).rating).toBe('high');
    // 5² × (5×4)=20 = 500 → critical
    expect(calculateBradfordFactor(makeAbsences(5, 4) as any).rating).toBe('critical');
  });
});

// ─── Leave Utils ──────────────────────────────────────────────────────────────

describe('calculateWorkingDays', () => {
  test('excludes weekends', () => {
    const mon = new Date('2025-05-19');
    const fri = new Date('2025-05-23');
    expect(calculateWorkingDays(mon, fri)).toBe(5);
  });

  test('excludes bank holidays by default', () => {
    // 2025-04-18 is Good Friday (bank holiday)
    const thu = new Date('2025-04-17');
    const fri = new Date('2025-04-18');
    expect(calculateWorkingDays(thu, fri)).toBe(1); // only Thursday counts
  });

  test('half day returns 0.5 for single working day', () => {
    const mon = new Date('2025-05-19');
    expect(calculateWorkingDays(mon, mon, 5, { halfDay: 'am' })).toBe(0.5);
  });
});

describe('calculateLeaveBalance', () => {
  test('returns correct remaining days', () => {
    const year = { start: new Date('2025-01-01'), end: new Date('2025-12-31') };
    const leave = [
      { id: '1', startDate: '2025-03-01', endDate: '2025-03-05',
        daysTaken: 5, status: 'approved', leaveType: 'annual' },
      { id: '2', startDate: '2025-06-01', endDate: '2025-06-03',
        daysTaken: 3, status: 'pending', leaveType: 'annual' },
    ];
    const result = calculateLeaveBalance(25, year, leave as any);
    expect(result.taken).toBe(5);
    expect(result.pending).toBe(3);
    expect(result.remaining).toBe(20);
  });
});
