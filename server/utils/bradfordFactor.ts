export interface AbsenceRecord {
  id?: string;
  startDate?: string | Date;
  start_date?: string | Date;
  returnDate?: string | Date | null;
  return_date?: string | Date | null;
  daysLost?: number | null;
  days_lost?: number | null;
}

export type BradfordRating = 'low' | 'medium' | 'high' | 'critical';

export function calculateBradfordFactor(
  absences: AbsenceRecord[],
  rollingDays: number = 365
): {
  score: number;
  spells: number;
  totalDays: number;
  rating: BradfordRating;
} {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - rollingDays);

  const relevant = absences.filter((a) => {
    const s = new Date((a as any).startDate ?? (a as any).start_date);
    return !isNaN(s.getTime()) && s >= cutoff;
  });

  const spells = relevant.length;
  const totalDays = relevant.reduce((sum, a) => sum + (Number((a as any).daysLost ?? (a as any).days_lost) || 0), 0);
  const score = spells * spells * totalDays;

  let rating: BradfordRating = 'low';
  if (score >= 450) rating = 'critical';
  else if (score >= 200) rating = 'high';
  else if (score >= 50) rating = 'medium';

  return { score, spells, totalDays, rating };
}
