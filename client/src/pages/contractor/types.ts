import type { ContractorCompany } from "@shared/schema";

// Extended type for list view with computed fields
export type ExtendedContractorCompany = ContractorCompany & {
  workersCount?: number;
  documentsStatus?: Record<string, string>;
  hasRedCard?: boolean;
  hasYellowCard?: boolean;
  serviceType?: string;
  contactEmail?: string;
};

// PPM work order summary type
export type PpmWorkOrderSummary = {
  id: string;
  title: string;
  status: string;
  dueDate?: string | null;
  contractorCompanyId?: string | null;
  contractorCompanyName?: string | null;
  contractorWorkerName?: string | null;
  assignedEmail?: string | null;
  requiresCertificate?: boolean | null;
  certificateUploadedAt?: string | null;
  assetName?: string | null;
};

export const PPM_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  scheduled:   { label: "Scheduled",   className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  in_progress: { label: "In Progress", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  completed:   { label: "Completed",   className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  overdue:     { label: "Overdue",     className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

// CDM 2015 types
export type CdmProject = {
  id: string;
  companyId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  clientName?: string | null;
  contractorRole: string;
  principalContractorId?: string | null;
  principalDesignerName?: string | null;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  estimatedDays?: number | null;
  peakWorkers?: number | null;
  personDays?: number | null;
  f10Status: string;
  f10Date?: string | null;
  f10Reference?: string | null;
  f10Notes?: string | null;
  f10AlertSentAt?: string | null;
  cppStatus: string;
  cppDate?: string | null;
  cppNotes?: string | null;
  pciStatus: string;
  pciDate?: string | null;
  pciNotes?: string | null;
  hsfStatus: string;
  hsfDate?: string | null;
  hsfNotes?: string | null;
  welfareToilets?: boolean | null;
  welfareWashing?: boolean | null;
  welfareRestArea?: boolean | null;
  welfareDrinkingWater?: boolean | null;
  welfareChanging?: boolean | null;
  notes?: string | null;
  createdAt?: string | null;
};

export const CDM_ROLE_LABELS: Record<string, string> = {
  principal_contractor: "Principal Contractor",
  principal_designer: "Principal Designer",
  contractor: "Contractor",
  designer: "Designer",
  client: "Client",
};

export const CDM_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  planning:  { label: "Planning",  className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  active:    { label: "Active",    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  complete:  { label: "Complete",  className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

/** Returns true when the project is notifiable under CDM 2015 Reg 6 */
export function isNotifiable(p: { estimatedDays?: number | null; peakWorkers?: number | null; personDays?: number | null }): boolean {
  const daysOk = (p.estimatedDays ?? 0) > 30 && (p.peakWorkers ?? 0) > 20;
  const personDaysOk = (p.personDays ?? 0) > 500;
  return daysOk || personDaysOk;
}

/** F10 overdue = notifiable project, F10 not yet submitted, and start date is in the past */
export function isF10Overdue(p: CdmProject): boolean {
  if (!isNotifiable(p)) return false;
  if (p.f10Status === "submitted") return false;
  if (!p.startDate) return false;
  return new Date(p.startDate) < new Date();
}

/** Compliance score: how many of the 5 sections are fully green */
export function complianceScore(p: CdmProject): number {
  let score = 0;
  if (!isNotifiable(p) || p.f10Status === "submitted") score++;
  if (p.cppStatus === "approved") score++;
  if (p.pciStatus === "distributed") score++;
  if (p.hsfStatus === "complete" || p.hsfStatus === "handed_over") score++;
  const welfareAll = p.welfareToilets && p.welfareWashing && p.welfareRestArea && p.welfareDrinkingWater && p.welfareChanging;
  if (welfareAll) score++;
  return score;
}
