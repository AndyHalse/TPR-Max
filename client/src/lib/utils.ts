import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface ContractorDocumentsStatus {
  publicLiability?: string;
  employersLiability?: string;
  healthSafety?: string;
  cisRegistration?: string;
  [key: string]: string | undefined;
}

export interface ContractorWithComplianceStatus {
  documentsStatus?: ContractorDocumentsStatus | null;
  [key: string]: unknown;
}

const COMPLIANCE_DOC_KEYS = ['publicLiability', 'employersLiability', 'healthSafety', 'cisRegistration'] as const;

// Checks company-level document gaps only (insurance + H&S + CIS).
// Does NOT include worker-level gaps (RTW, CSCS, DBS, certs).
// Use the /api/contractors/compliance-gap-count endpoint for the full picture.
export function hasContractorCompanyDocumentGap(contractor: ContractorWithComplianceStatus): boolean {
  const ds = contractor.documentsStatus;
  if (!ds) return true;
  return COMPLIANCE_DOC_KEYS.some(key => ds[key] === 'missing' || ds[key] === 'expired');
}

// Kept for backward compatibility — prefer hasContractorCompanyDocumentGap.
export const hasContractorComplianceGap = hasContractorCompanyDocumentGap;

// ── Worker safety-status helper ────────────────────────────────────────────
// Single source of truth for all disciplinary card display.
// ALWAYS gates on hasActiveDisciplinaryCard (from card_issues), NOT
// the denormalised currentCardStatus column which may hold phantom values.
export interface WorkerSafetyStatus {
  color: 'green' | 'yellow' | 'red';
  label: string;
  isClear: boolean;
}

export function getWorkerSafetyStatus(worker: {
  hasActiveDisciplinaryCard?: boolean;
  currentCardStatus?: string | null;
}): WorkerSafetyStatus {
  if (!worker.hasActiveDisciplinaryCard) {
    return { color: 'green', label: 'CLEAR - COMPLIANT', isClear: true };
  }
  if (worker.currentCardStatus === 'red') {
    return { color: 'red', label: 'RED CARD - BANNED', isClear: false };
  }
  return { color: 'yellow', label: 'YELLOW CARD - WARNING', isClear: false };
}
