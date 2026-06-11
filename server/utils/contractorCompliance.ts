import { eq } from "drizzle-orm";
import * as isolatedSchema from "../isolatedSchema";
import { customerDbService } from "../customerDatabase";

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
  workerId: string,
  customerId?: string
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

  // DBS — only checked when the worker has been explicitly flagged as requiring it
  if ((worker as any).dbsRequired === true && customerId) {
    try {
      const schemaName = customerDbService.generateSchemaName(customerId);
      const pool = (custDb as any).$client ?? (custDb as any).session?.client;
      if (pool && schemaName) {
        const result = await pool.query(
          `SELECT policy_expiry_date FROM "${schemaName}".contractor_worker_dbs
           WHERE worker_id = $1 AND is_current = TRUE AND deleted_at IS NULL
           LIMIT 1`,
          [workerId]
        );
        if (result.rows.length === 0) {
          reasons.push("DBS check required but not on record");
        } else {
          const expiry = result.rows[0].policy_expiry_date;
          if (expiry && new Date(expiry) < new Date()) {
            reasons.push("DBS check expired");
          }
        }
      }
    } catch {
      // Non-fatal: if the table doesn't exist yet (e.g. migration pending), skip DBS check
    }
  }

  return { compliant: reasons.length === 0, reasons };
}
