import { eq, and } from "drizzle-orm";
import * as isolatedSchema from "../isolatedSchema";

export type ComplianceResult = {
  compliant: boolean;
  reasons: string[];
};

const LEGALLY_REQUIRED_DOC_TYPES: Array<{ key: string; label: string }> = [
  { key: "publicLiability", label: "Public Liability Insurance" },
  { key: "employersLiability", label: "Employers' Liability Insurance" },
];

export async function getCompanyComplianceStatus(
  custDb: any,
  companyId: string
): Promise<ComplianceResult> {
  const reasons: string[] = [];
  const documents = await custDb
    .select()
    .from(isolatedSchema.contractorDocuments)
    .where(eq(isolatedSchema.contractorDocuments.companyId, companyId));

  const now = new Date();
  for (const req of LEGALLY_REQUIRED_DOC_TYPES) {
    const doc = documents.find((d: any) => d.documentType === req.key);
    if (!doc) {
      reasons.push(`${req.label} missing`);
      continue;
    }
    if (doc.expiryDate && new Date(doc.expiryDate) < now) {
      reasons.push(`${req.label} expired`);
    }
  }

  return { compliant: reasons.length === 0, reasons };
}

export async function getWorkerClearanceStatus(
  custDb: any,
  workerId: string
): Promise<ComplianceResult> {
  const [worker] = await custDb
    .select()
    .from(isolatedSchema.contractorWorkers)
    .where(eq(isolatedSchema.contractorWorkers.id, workerId));

  if (!worker) return { compliant: false, reasons: ["Worker not found"] };

  const reasons: string[] = [];
  const status = (worker as any).workerStatus;
  if (status === "banned" || status === "suspended") {
    reasons.push(`Worker is ${status}`);
  }
  const rtw = (worker as any).rightToWork;
  if (rtw !== "valid") {
    reasons.push("Right to Work not verified");
  }
  const inducted =
    (worker as any).inductionCompleted ?? (worker as any).siteInductionCompleted;
  if (!inducted) {
    reasons.push("Site induction not completed");
  }

  return { compliant: reasons.length === 0, reasons };
}
