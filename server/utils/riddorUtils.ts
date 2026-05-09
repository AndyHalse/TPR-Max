export type RIDDORCategory =
  | 'fatality'
  | 'specified_injury'
  | 'over_7_day'
  | 'dangerous_occurrence'
  | 'occupational_disease'
  | 'not_riddor_reportable'

export const RIDDOR_CATEGORY_LABELS: Record<RIDDORCategory, string> = {
  fatality: 'Fatality',
  specified_injury: 'Specified Injury',
  over_7_day: 'Over-7-Day Incapacitation',
  dangerous_occurrence: 'Dangerous Occurrence',
  occupational_disease: 'Occupational Disease',
  not_riddor_reportable: 'Not RIDDOR Reportable',
};

export function calculateRIDDORDeadline(
  category: RIDDORCategory,
  incidentDate: Date
): Date | null {
  const d = new Date(incidentDate);
  switch (category) {
    case 'fatality':
      return d;
    case 'specified_injury':
    case 'dangerous_occurrence':
      d.setDate(d.getDate() + 10);
      return d;
    case 'over_7_day':
      d.setDate(d.getDate() + 15);
      return d;
    case 'occupational_disease':
      return null;
    default:
      return null;
  }
}

export function getDaysUntilRIDDORDeadline(deadline: Date): number {
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function isRIDDOROverdue(deadline: Date | null): boolean {
  if (!deadline) return false;
  return new Date() > deadline;
}
