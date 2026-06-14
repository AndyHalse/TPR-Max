export function calculateCertificateStatus(
  expiryDate: string | null | undefined,
  reminderDaysBefore: number = 30
): 'current' | 'expiring_soon' | 'expired' | 'no_expiry' {
  if (!expiryDate) return 'no_expiry';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate); expiry.setHours(0, 0, 0, 0);
  if (expiry < today) return 'expired';
  const daysUntil = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil <= reminderDaysBefore) return 'expiring_soon';
  return 'current';
}

export function calculateNextDueDate(
  issueDate: string,
  frequency: string,
  customDays?: number | null
): string | null {
  if (!issueDate) return null;
  const d = new Date(issueDate);
  if (isNaN(d.getTime())) return null;
  if (frequency === 'custom' && (customDays === 0 || customDays == null)) return null;
  switch (frequency) {
    case 'weekly':     d.setDate(d.getDate() + 7); break;
    case 'monthly':    d.setMonth(d.getMonth() + 1); break;
    case 'quarterly':  d.setMonth(d.getMonth() + 3); break;
    case 'biannual':   d.setMonth(d.getMonth() + 6); break;
    case 'annual':     d.setFullYear(d.getFullYear() + 1); break;
    case 'five_yearly': d.setFullYear(d.getFullYear() + 5); break;
    case 'custom':     d.setDate(d.getDate() + (customDays ?? 30)); break;
    default:           d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().split('T')[0];
}

export function getDaysUntilExpiry(expiryDate: string | null | undefined): number | null {
  if (!expiryDate) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate); expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * The date the register should judge a certificate against.
 * Prefer a manually-entered expiry date; fall back to the frequency-derived
 * next-due date so recurring tests (weekly fire alarm, monthly emergency
 * lighting, etc.) are still tracked when no expiry date is typed.
 */
export function getEffectiveDueDate(
  cert: { expiryDate?: string | null; nextDueDate?: string | null }
): string | null {
  return cert.expiryDate || cert.nextDueDate || null;
}

export const CERT_SEED_DATA = [
  { type: 'fire_alarm_test_weekly',     name: 'Fire Alarm Test (Weekly)',                         legal: 'Regulatory Reform (Fire Safety) Order 2005',          freq: 'weekly' },
  { type: 'fire_alarm_test_full',       name: 'Fire Alarm Test (Full)',                           legal: 'BS 5839-1',                                           freq: 'biannual' },
  { type: 'emergency_lighting_monthly', name: 'Emergency Lighting Test (Monthly)',                legal: 'BS 5266-1',                                           freq: 'monthly' },
  { type: 'emergency_lighting_annual',  name: 'Emergency Lighting Test (Annual)',                 legal: 'BS 5266-1',                                           freq: 'annual' },
  { type: 'eicr',                       name: 'Electrical Installation Condition Report (EICR)',  legal: 'Electricity at Work Regulations 1989',                freq: 'five_yearly' },
  { type: 'gas_safety',                 name: 'Gas Safety Check',                                 legal: 'Gas Safety (Installation and Use) Regulations 1998', freq: 'annual' },
  { type: 'loler_lift',                 name: 'Lift Inspection (LOLER)',                          legal: 'Lifting Operations and Lifting Equipment Regulations 1998', freq: 'biannual' },
  { type: 'legionella_risk_assessment', name: 'Legionella Risk Assessment',                       legal: 'L8 Approved Code of Practice',                        freq: 'annual' },
  { type: 'legionella_water_testing',   name: 'Legionella Water Testing',                         legal: 'L8 Approved Code of Practice',                        freq: 'monthly' },
  { type: 'asbestos_survey',            name: 'Asbestos Management Survey',                       legal: 'Control of Asbestos Regulations 2012',                freq: 'custom', customDays: 0 },
  { type: 'pat_testing',                name: 'PAT Testing',                                      legal: 'Electricity at Work Regulations 1989',                freq: 'annual' },
  { type: 'sprinkler_system',           name: 'Sprinkler System Inspection',                      legal: 'BS 9251',                                             freq: 'annual' },
  { type: 'lightning_protection',       name: 'Lightning Protection Test',                        legal: 'BS EN 62305',                                         freq: 'annual' },
  { type: 'fire_risk_assessment',       name: 'Fire Risk Assessment',                             legal: 'Regulatory Reform (Fire Safety) Order 2005',          freq: 'annual' },
] as const;
