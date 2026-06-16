import { eq, and } from "drizzle-orm";
import * as isolatedSchema from "../isolatedSchema";
import { customerDbService } from "../customerDatabase";
import { EmailService } from "../emailService";
import { logger } from "../utils/logger";

export type ComplianceResult = {
  compliant: boolean;
  reasons: string[];
};

// ── RTW status vocabulary (canonical): pending | verified | expired | invalid
// "valid" is a legacy alias for "verified" — treat identically.
export function evaluateRightToWork(status: string | null | undefined): { blocked: boolean; warning: boolean; message: string } {
  if (!status || status === "pending") {
    return { blocked: false, warning: true, message: "Right to Work not yet verified" };
  }
  if (status === "verified" || status === "valid") {
    return { blocked: false, warning: false, message: "" };
  }
  if (status === "expired") {
    return { blocked: true, warning: false, message: "Right to Work has expired" };
  }
  // invalid, missing, or any unknown value → blocking
  return { blocked: true, warning: false, message: `Right to Work not accepted (status: ${status})` };
}

export type WorkerReadiness = {
  ready: boolean;
  blocking: string[];
  warnings: string[];
  compliant: boolean;
  reasons: string[];
};

// ── UK default requirements — single source of truth ─────────────────────
export const UK_DEFAULT_REQUIREMENTS = [
  { document_type: "publicLiability",       label: "Public Liability Insurance",                 is_required: true,  sort_order: 1 },
  { document_type: "employersLiability",    label: "Employers' Liability Insurance",              is_required: true,  sort_order: 2 },
  { document_type: "rams",                  label: "Risk Assessment & Method Statement (RAMS)",   is_required: true,  sort_order: 3 },
  { document_type: "healthSafety",          label: "Health & Safety Policy",                      is_required: true,  sort_order: 4 },
  { document_type: "cisRegistration",       label: "CIS Registration",                            is_required: false, sort_order: 5 },
  { document_type: "professionalIndemnity", label: "Professional Indemnity Insurance",            is_required: false, sort_order: 6 },
  { document_type: "modernSlavery",         label: "Modern Slavery Statement",                    is_required: false, sort_order: 7 },
  { document_type: "environmentalPolicy",   label: "Environmental Policy",                        is_required: false, sort_order: 8 },
  { document_type: "other",                 label: "Other Document",                              is_required: false, sort_order: 9 },
];

// ── Shared seed helper — called from both migration and GET endpoint ───────
export async function seedOnboardingRequirements(pool: any, schemaName: string): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "${schemaName}".contractor_onboarding_requirements (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      document_type TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      is_required BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  const values = UK_DEFAULT_REQUIREMENTS
    .map(r => `('${r.document_type}', '${r.label.replace(/'/g, "''")}', ${r.is_required}, ${r.sort_order})`)
    .join(",\n    ");
  await pool.query(`
    INSERT INTO "${schemaName}".contractor_onboarding_requirements (document_type, label, is_required, sort_order) VALUES
      ${values}
    ON CONFLICT (document_type) DO NOTHING
  `);
}

const DEFAULT_REQUIRED_DOC_TYPES = UK_DEFAULT_REQUIREMENTS
  .filter(r => r.is_required)
  .map(r => ({ key: r.document_type, label: r.label }));

async function getRequiredDocTypes(custDb: any): Promise<Array<{ key: string; label: string }>> {
  try {
    const pool = (custDb as any).$client ?? (custDb as any).session?.client;
    if (!pool) return DEFAULT_REQUIRED_DOC_TYPES;
    const result = await pool.query(
      `SELECT document_type, label FROM contractor_onboarding_requirements WHERE is_required = true ORDER BY sort_order`
    );
    if (result.rows.length > 0) {
      return result.rows.map((r: any) => ({ key: r.document_type, label: r.label }));
    }
  } catch {
    // Table may not exist yet on older schemas — fall back to defaults
  }
  return DEFAULT_REQUIRED_DOC_TYPES;
}

export async function getCompanyComplianceStatus(
  custDb: any,
  companyId: string
): Promise<ComplianceResult> {
  const reasons: string[] = [];

  const [requiredTypes, documents] = await Promise.all([
    getRequiredDocTypes(custDb),
    custDb
      .select()
      .from(isolatedSchema.contractorDocuments)
      .where(
        and(
          eq(isolatedSchema.contractorDocuments.companyId, companyId),
          eq(isolatedSchema.contractorDocuments.isActive, true)
        )
      ),
  ]);

  const now = new Date();
  for (const req of requiredTypes) {
    const matching = documents.filter((d: any) => d.documentType === req.key);
    if (matching.length === 0) {
      reasons.push(`${req.label} missing`);
      continue;
    }
    const valid = matching.find((d: any) => {
      if (d.status === "rejected") return false;
      if (d.expiryDate && new Date(d.expiryDate) < now) return false;
      return true;
    });
    if (!valid) reasons.push(`${req.label} expired or rejected`);
  }

  return { compliant: reasons.length === 0, reasons };
}

export async function getWorkerClearanceStatus(
  custDb: any,
  workerId: string,
  customerId?: string
): Promise<WorkerReadiness> {
  const [worker] = await custDb
    .select()
    .from(isolatedSchema.contractorWorkers)
    .where(eq(isolatedSchema.contractorWorkers.id, workerId));

  if (!worker) {
    return {
      ready: false, blocking: ["Worker not found"], warnings: [],
      compliant: false, reasons: ["Worker not found"],
    };
  }

  const blocking: string[] = [];
  const warnings: string[] = [];

  // Worker-level gates
  if (worker.isActive === false) blocking.push("Worker account is inactive");

  const wStatus = (worker as any).workerStatus;
  if (wStatus === "banned" || wStatus === "suspended") blocking.push(`Worker is ${wStatus}`);

  if ((worker as any).currentCardStatus === "red") blocking.push("Worker has an active Red Card (site ban)");

  // Right to Work — use canonical evaluator so the rule lives in one place
  const rtw = (worker as any).rightToWork;
  const rtwResult = evaluateRightToWork(rtw);
  if (rtwResult.blocked) blocking.push(rtwResult.message);
  else if (rtwResult.warning) warnings.push(rtwResult.message);

  // Site induction
  const inducted =
    (worker as any).inductionCompleted ?? (worker as any).siteInductionCompleted;
  if (!inducted) blocking.push("Site induction not completed");

  // DBS — only when explicitly flagged
  if ((worker as any).dbsRequired === true && customerId) {
    try {
      const schemaName = customerDbService.generateSchemaName(customerId);
      const pool = (custDb as any).$client ?? (custDb as any).session?.client;
      if (pool && schemaName) {
        const result = await pool.query(
          `SELECT policy_expiry_date FROM "${schemaName}".contractor_worker_dbs
           WHERE worker_id = $1 AND is_current = TRUE AND deleted_at IS NULL LIMIT 1`,
          [workerId]
        );
        if (result.rows.length === 0) blocking.push("DBS check required but not on record");
        else {
          const expiry = result.rows[0].policy_expiry_date;
          if (expiry && new Date(expiry) < new Date()) blocking.push("DBS check expired");
        }
      }
    } catch { /* Non-fatal */ }
  }

  // Company-level gate — fetch via raw SQL (columns added by migration, not in Drizzle schema)
  try {
    const pool = (custDb as any).$client ?? (custDb as any).session?.client;
    if (pool && (worker as any).companyId) {
      const result = await pool.query(
        `SELECT status, onboarding_status FROM contractor_companies WHERE id = $1 LIMIT 1`,
        [(worker as any).companyId]
      );
      if (result.rows.length > 0) {
        const co = result.rows[0];
        if (co.status === "suspended") blocking.push("Contractor company is suspended");
        if (co.onboarding_status && co.onboarding_status !== "approved") {
          blocking.push("Contractor company has not been approved for site");
        }
      }
    }
  } catch { /* Non-fatal */ }

  const ready = blocking.length === 0;
  const reasons = [...blocking, ...warnings];
  return { ready, blocking, warnings, compliant: ready, reasons };
}

// ── Auto-revert an approved company if compliance has lapsed ──────────────
// Call after any document review, and from the nightly cron.
// Only acts when the company is currently 'approved' and compliance is now broken.
// Deduplication: only sends the alert email on the transition (not on every cron run).
export async function reevaluateCompanyApproval(
  db: any,
  customerId: string,
  companyId: string
): Promise<void> {
  try {
    const pool = (db as any).$client ?? (db as any).session?.client;
    if (!pool) return;
    const schemaName = customerDbService.generateSchemaName(customerId);

    const coResult = await pool.query(
      `SELECT onboarding_status FROM "${schemaName}".contractor_companies WHERE id = $1 LIMIT 1`,
      [companyId]
    );
    if (!coResult.rows[0] || coResult.rows[0].onboarding_status !== 'approved') return;

    const compliance = await getCompanyComplianceStatus(db, companyId);
    if (compliance.compliant) return;

    // Transition: approved → attention_needed
    await pool.query(
      `UPDATE "${schemaName}".contractor_companies SET onboarding_status = 'attention_needed', updated_at = NOW() WHERE id = $1`,
      [companyId]
    );
    const reasonText = compliance.reasons.join('; ');
    await pool.query(
      `INSERT INTO "${schemaName}".contractor_onboarding_audit (company_id, action, actor, reason) VALUES ($1, 'auto_reverted', 'system', $2)`,
      [companyId, reasonText]
    );

    // Alert email — only on the transition so the cron doesn't spam
    try {
      const settingsRows = await db.execute(`SELECT email, company_name FROM company_settings LIMIT 1`);
      const settings = settingsRows.rows?.[0] as { email?: string; company_name?: string } | undefined;
      const adminEmail = settings?.email as string | undefined;
      const siteName = (settings?.company_name as string) || 'TPR Max';

      const nameResult = await pool.query(
        `SELECT company_name FROM "${schemaName}".contractor_companies WHERE id = $1 LIMIT 1`,
        [companyId]
      );
      const contractorName = nameResult.rows[0]?.company_name ?? 'A contractor';

      if (adminEmail) {
        const emailSvc = new EmailService(customerId);
        await emailSvc.sendEmail({
          to: adminEmail,
          subject: `⚠️ Compliance lapsed — ${contractorName} needs review`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
              <div style="background:#b45309;padding:16px 24px;border-radius:8px 8px 0 0">
                <p style="color:white;margin:0;font-size:18px;font-weight:bold">Contractor Compliance Alert</p>
              </div>
              <div style="padding:20px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
                <p><strong>${contractorName}</strong> was previously approved but is no longer fully compliant. Their status has been set to <strong>Attention Needed</strong>.</p>
                <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:12px 16px;margin:16px 0">
                  <p style="margin:0;font-weight:600;color:#92400e">Issues detected:</p>
                  <ul style="margin:8px 0 0;padding-left:20px;color:#78350f">
                    ${compliance.reasons.map(r => `<li>${r}</li>`).join('')}
                  </ul>
                </div>
                <p>Please log in to ${siteName} and review their documents.</p>
              </div>
            </div>
          `,
          text: `${contractorName} is no longer fully compliant and has been set to Attention Needed.\n\nIssues:\n${compliance.reasons.map(r => `- ${r}`).join('\n')}\n\nPlease review in ${siteName}.`,
        });
      }
    } catch (emailErr: any) {
      logger.warn('[reevaluateCompanyApproval] Alert email failed (non-fatal):', emailErr.message?.substring(0, 80));
    }
  } catch (err: any) {
    logger.warn('[reevaluateCompanyApproval] Non-fatal error:', err.message?.substring(0, 120));
  }
}
